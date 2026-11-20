import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Download, FileText, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { LanguageSelect } from "@/client/components/LanguageSelect";
import { PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatTime, pairLabel } from "@/client/lib/format";
import { DETECT } from "@/lib/languages";
import type { DocumentJob, DocumentStatus } from "@/server/documents";
import {
  deleteDocument,
  getDocuments,
  startDocument,
} from "@/serverFunctions/documents";

export const Route = createFileRoute("/documents")({
  loader: () => getDocuments(),
  head: () => ({ meta: [{ title: "Documents · Translator" }] }),
  component: DocumentsPage,
});

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".docx,.pptx,.xlsx";

const STATUS: Record<
  DocumentStatus,
  { label: string; variant: "secondary" | "info" | "success" | "destructive" }
> = {
  queued: { label: "Queued", variant: "secondary" },
  running: { label: "Translating", variant: "info" },
  done: { label: "Done", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

function DocumentsPage() {
  const jobs = Route.useLoaderData();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState(DETECT);
  const [target, setTarget] = useState("en");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<DocumentJob | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  // While a job is under way, read the list again every two seconds.
  const working = jobs.some((job) => job.status === "queued" || job.status === "running");
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void router.invalidate(), 2000);
    return () => clearInterval(timer);
  }, [working, router]);

  function refusal(): string | null {
    if (!file) return "Choose a file.";
    if (!/\.(docx|pptx|xlsx)$/i.test(file.name)) return "Choose a .docx, .pptx or .xlsx file.";
    if (file.size > MAX_BYTES) return "Files can be at most 10 MB.";
    if (source === target) return "Pick two different languages.";
    return null;
  }

  async function start() {
    const refused = refusal();
    if (refused) {
      setError(refused);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const form = new FormData();
      form.set("file", file!);
      form.set("source", source);
      form.set("target", target);
      const answer = await startDocument({ data: form });
      if ("refused" in answer) {
        setError(answer.refused);
        return;
      }
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await router.invalidate();
    } catch {
      setError("The upload failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove(job: DocumentJob) {
    setDeletePending(true);
    try {
      await deleteDocument({ data: { id: job.id } });
      setDeleting(null);
      await router.invalidate();
    } catch {
      toast.error("That didn't work. Try again.");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader title="Documents" />

      <section className="space-y-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xs">
        <div className="space-y-2">
          <Label htmlFor="document-file">File</Label>
          <Input
            id="document-file"
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            data-testid="document-file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          <p className="text-xs text-muted-foreground">.docx, .pptx or .xlsx, up to 10 MB</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <LanguageSelect
            label="Translate from"
            testId="doc-source-language"
            detect
            value={source}
            onChange={setSource}
          />
          <span aria-hidden className="hidden text-muted-foreground sm:inline">→</span>
          <LanguageSelect
            label="Translate to"
            testId="doc-target-language"
            value={target}
            onChange={setTarget}
          />
          <Button
            data-testid="start-document"
            pending={pending}
            onClick={() => void start()}
            className="sm:ml-auto"
          >
            Translate
          </Button>
        </div>
        {error ? (
          <Alert variant="destructive" data-testid="document-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      {jobs.length === 0 ? (
        <div data-testid="documents-empty">
          <EmptyState
            icon={FileText}
            media="rows"
            title="No documents yet"
            description="Upload one above and its translation appears here."
          />
        </div>
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Languages</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} onDelete={() => setDeleting(job)} />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.filename}?`}
          confirmLabel="Delete"
          destructive
          pending={deletePending}
          onConfirm={() => void remove(deleting)}
          onClose={() => setDeleting(null)}
        >
          The original and its translation are deleted.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function JobRow({ job, onDelete }: { job: DocumentJob; onDelete: () => void }) {
  const status = STATUS[job.status];
  return (
    <TableRow data-testid="document-row">
      <TableCell>
        <p className="font-medium break-all">{job.filename}</p>
        <time
          className="text-xs text-muted-foreground"
          dateTime={new Date(job.createdAt).toISOString()}
          suppressHydrationWarning
        >
          {formatTime(job.createdAt)}
        </time>
      </TableCell>
      <TableCell className="text-sm">{pairLabel(job)}</TableCell>
      <TableCell>
        <Badge variant={status.variant} data-testid="document-status">
          {status.label}
        </Badge>
        {job.status === "failed" && job.error ? (
          <p className="mt-1 text-xs text-destructive">{job.error}</p>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {job.status === "done" ? (
            <Button
              size="sm"
              data-testid="download-translated"
              render={<a href={`/api/documents/${job.id}/translated`} download />}
              nativeButton={false}
            >
              <Download />
              Translation
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            data-testid="download-original"
            render={<a href={`/api/documents/${job.id}/original`} download />}
            nativeButton={false}
          >
            Original
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${job.filename}`}
            data-testid="delete-document"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
