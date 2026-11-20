import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, Check, Copy, Star } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { LanguageSelect } from "@/client/components/LanguageSelect";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";
import { useCopy } from "@/client/hooks/useCopy";
import { DETECT, isLanguage, languageName, MAX_CHARS } from "@/lib/languages";
import type { Entry } from "@/server/translations";
import { getEntry, setSaved, translateText } from "@/serverFunctions/translator";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ id: z.string().max(64).optional() }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: ({ deps }) => (deps.id ? getEntry({ data: { id: deps.id } }) : null),
  head: () => ({ meta: [{ title: "Translate · Translator" }] }),
  component: TranslatePage,
});

function TranslatePage() {
  const entry = Route.useLoaderData();
  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Translate" />
      <Translator key={entry?.id ?? "new"} initial={entry} />
    </AppShell>
  );
}

type Problem =
  | { kind: "error"; message: string }
  | { kind: "setup"; setup: string | null; command: string | null };

function Translator({ initial }: { initial: Entry | null }) {
  const [source, setSource] = useState(initial?.sourceLang ?? DETECT);
  const [target, setTarget] = useState(initial?.targetLang ?? "en");
  const [text, setText] = useState(initial?.sourceText ?? "");
  const [result, setResult] = useState<Entry | null>(initial);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const { copied, copy } = useCopy();

  const tooLong = text.length > MAX_CHARS;
  const detected = source === DETECT ? (result?.detectedLang ?? null) : null;
  // Swapping needs a known source language to become the target.
  const swapTarget = source === DETECT ? detected : source;
  const canSwap = !!swapTarget && isLanguage(swapTarget);

  function check(): string | null {
    if (!text.trim()) return "Enter some text to translate.";
    if (tooLong)
      return `Text can be at most ${MAX_CHARS.toLocaleString("en-US")} characters.`;
    if (source === target) return "Pick two different languages.";
    return null;
  }

  async function run() {
    const refused = check();
    if (refused) {
      setProblem({ kind: "error", message: refused });
      return;
    }
    setProblem(null);
    setPending(true);
    try {
      const answer = await translateText({ data: { text, source, target } });
      if (answer.status === "ok") setResult(answer.entry);
      else {
        setResult(null);
        setProblem(
          answer.status === "setup"
            ? { kind: "setup", setup: answer.setup, command: answer.command }
            : { kind: "error", message: answer.message },
        );
      }
    } catch (cause) {
      setResult(null);
      setProblem({
        kind: "error",
        message: cause instanceof Error ? cause.message : "The translation failed.",
      });
    } finally {
      setPending(false);
    }
  }

  function swap() {
    if (!canSwap || !swapTarget) return;
    setSource(target);
    setTarget(swapTarget);
    if (result) setText(result.translatedText);
    setResult(null);
    setProblem(null);
  }

  async function toggleSaved() {
    if (!result) return;
    setSaving(true);
    try {
      await setSaved({ data: { id: result.id, saved: !result.saved } });
      setResult({ ...result, saved: !result.saved });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <LanguageSelect
          label="Translate from"
          testId="source-language"
          detect
          value={source}
          onChange={(code) => {
            setSource(code);
            setResult(null);
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Swap languages"
          data-testid="swap-languages"
          disabled={!canSwap}
          onClick={swap}
          className="self-center"
        >
          <ArrowLeftRight />
        </Button>
        <LanguageSelect
          label="Translate to"
          testId="target-language"
          value={target}
          onChange={(code) => {
            setTarget(code);
            setResult(null);
          }}
        />
        {detected ? (
          <Badge variant="soft" data-testid="detected-language" className="self-start sm:self-center">
            Detected: {languageName(detected)}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Textarea
            aria-label="Text to translate"
            data-testid="source-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void run();
              }
            }}
            aria-invalid={tooLong || undefined}
            className="min-h-48 bg-card"
          />
          <div className="flex items-center justify-between gap-3">
            <span
              data-testid="char-count"
              className={tooLong ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
            >
              {text.length.toLocaleString("en-US")} / {MAX_CHARS.toLocaleString("en-US")}
            </span>
            <Button data-testid="translate-button" pending={pending} onClick={() => void run()}>
              Translate
            </Button>
          </div>
        </div>

        <div className="min-h-48 rounded-lg border border-border bg-muted/40 p-3">
          {result ? (
            <div className="flex h-full flex-col gap-3">
              <p
                data-testid="translation-result"
                lang={result.targetLang}
                className="flex-1 text-base break-words whitespace-pre-wrap"
              >
                {result.translatedText}
              </p>
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy translation"
                  data-testid="copy-translation"
                  onClick={() => void copy(result.translatedText, "Copied")}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={result.saved ? "Remove from saved" : "Save"}
                  aria-pressed={result.saved}
                  data-testid="save-translation"
                  disabled={saving}
                  onClick={() => void toggleSaved()}
                  className={result.saved ? "text-primary" : "text-muted-foreground"}
                >
                  <Star className={result.saved ? "fill-current" : undefined} />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Translation</p>
          )}
        </div>
      </div>

      {problem?.kind === "error" ? (
        <Alert variant="destructive" data-testid="translate-error">
          <AlertDescription>{problem.message}</AlertDescription>
        </Alert>
      ) : null}
      {problem?.kind === "setup" ? (
        <Alert data-testid="ai-setup">
          <AlertTitle>Translation needs an AI model</AlertTitle>
          <AlertDescription>
            <p>{problem.setup ?? "Set up an AI provider in your Gateway."}</p>
            {problem.command ? (
              <p>
                <code>{problem.command}</code>
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
