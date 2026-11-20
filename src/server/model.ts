import { env } from "cloudflare:workers";
import {
  aiBaseUrl,
  createGatewayFetch,
  gatewayRefusal,
  refusalFromError,
  type GatewayCallFor,
} from "@every-app/sdk/server";
import { DETECT, languageName } from "@/lib/languages";

/** No model is set up in the Gateway: what to show instead of a result. */
export class ModelNotConfigured extends Error {
  constructor(
    readonly setup: string | null,
    readonly command: string | null,
  ) {
    super(setup ?? "No AI model is set up in the Gateway.");
  }
}

export interface ModelAnswer {
  /** The source language's code: the one asked for, or the one detected. */
  detected: string | null;
  translations: string[];
}

const INSTRUCTIONS = `You are a translation engine. The user message is JSON with "from" (a language code, or "auto" when you must detect it), "to" and "toName" (the target language) and "texts" (strings to translate).
Translate every string in "texts" into the target language. Keep the meaning, tone, line breaks, numbers, names, URLs and placeholders. Never add notes or explanations.
Reply with JSON only: {"detected": "<the source language's code, e.g. en>", "translations": [<one string per input string, in the same order>]}`;

/**
 * Translates `texts` with the workspace's default model, through the
 * Gateway. `background` is set for work no request is waiting on.
 */
export async function translateTexts({
  texts,
  from,
  to,
  background = false,
}: {
  texts: string[];
  from: string;
  to: string;
  background?: boolean;
}): Promise<ModelAnswer> {
  const target: GatewayCallFor | undefined = background
    ? { background: true }
    : undefined;
  let response: Response;
  try {
    const gatewayFetch = createGatewayFetch({ env, for: target });
    response = await gatewayFetch(`${aiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "default",
        temperature: 0,
        messages: [
          { role: "system", content: INSTRUCTIONS },
          {
            role: "user",
            content: JSON.stringify({
              from,
              ...(from === DETECT ? {} : { fromName: languageName(from) }),
              to,
              toName: languageName(to),
              texts,
            }),
          },
        ],
      }),
    });
  } catch (error) {
    throw notConfigured(refusalFromError(error)) ?? error;
  }

  const refusal = await gatewayRefusal(response);
  if (refusal) {
    throw (
      notConfigured(refusal) ??
      new Error(`The AI model refused the request: ${refusal.message}`)
    );
  }
  if (!response.ok) {
    throw new Error(`The AI model answered with an error (${response.status}).`);
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const answer = parseAnswer(body.choices?.[0]?.message?.content ?? "");
  if (!answer || answer.translations.length !== texts.length) {
    throw new Error("The AI model's answer couldn't be read. Try again.");
  }
  return {
    detected: from === DETECT ? normalizeCode(answer.detected) : from,
    translations: answer.translations,
  };
}

function notConfigured(
  refusal: { code: string; setup: string | null; command: string | null } | null,
): ModelNotConfigured | null {
  if (!refusal || !refusal.code.endsWith("_not_configured")) return null;
  return new ModelNotConfigured(refusal.setup, refusal.command);
}

function parseAnswer(
  content: string,
): { detected: unknown; translations: string[] } | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as {
      detected?: unknown;
      translations?: unknown;
    };
    if (
      !Array.isArray(parsed.translations) ||
      !parsed.translations.every((item) => typeof item === "string")
    ) {
      return null;
    }
    return { detected: parsed.detected, translations: parsed.translations };
  } catch {
    return null;
  }
}

function normalizeCode(code: unknown): string | null {
  if (typeof code !== "string" || !code.trim()) return null;
  const trimmed = code.trim();
  return /^[a-z]{2,3}(-[A-Za-z]{2})?$/i.test(trimmed)
    ? trimmed.toLowerCase().replace(/-([a-z]{2})$/, (_, region: string) => `-${region.toUpperCase()}`)
    : trimmed.slice(0, 32);
}
