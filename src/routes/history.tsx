import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, History as HistoryIcon, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { EntryCard } from "@/client/components/EntryCard";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  clearHistory,
  deleteEntry,
  getHistory,
  setSaved,
} from "@/serverFunctions/translator";

export const Route = createFileRoute("/history")({
  validateSearch: z.object({
    page: z.number().int().min(1).optional(),
    q: z.string().max(200).optional(),
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1, q: search.q ?? "" }),
  loader: ({ deps }) => getHistory({ data: deps }),
  head: () => ({ meta: [{ title: "History · Translator" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { entries, page, pages, total } = Route.useLoaderData();
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/history" });
  const router = useRouter();
  const [query, setQuery] = useState(q);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  // The search box drives the URL, a moment after typing stops.
  useEffect(() => {
    if (query === q) return;
    const timer = setTimeout(() => {
      void navigate({ search: { q: query || undefined }, replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, q, navigate]);

  async function change(id: string, work: () => Promise<unknown>) {
    setBusy(id);
    try {
      await work();
      await router.invalidate();
    } catch {
      toast.error("That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    setClearing(true);
    try {
      await clearHistory();
      setConfirming(false);
      await navigate({ search: {} });
      await router.invalidate();
    } catch {
      toast.error("That didn't work. Try again.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="History"
        actions={
          total > 0 || q ? (
            <Button
              variant="outline"
              data-testid="clear-history"
              onClick={() => setConfirming(true)}
            >
              Clear history
            </Button>
          ) : null
        }
      />
      {total > 0 || q ? (
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search history"
            placeholder="Search"
            data-testid="history-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-card pl-9"
          />
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div data-testid="history-empty">
          {q ? (
            <EmptyState kind="filtered" title={`Nothing matches “${q}”.`} />
          ) : (
            <EmptyState
              icon={HistoryIcon}
              title="No translations yet"
              description="Translations you make appear here."
            />
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              testId="history-entry"
              busy={busy === entry.id}
              onToggleSaved={() =>
                change(entry.id, () =>
                  setSaved({ data: { id: entry.id, saved: !entry.saved } }),
                )
              }
              onDelete={() =>
                change(entry.id, () => deleteEntry({ data: { id: entry.id } }))
              }
            />
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <span data-testid="page-indicator" className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            data-testid="prev-page"
            disabled={page <= 1}
            onClick={() => void navigate({ search: (prev) => ({ ...prev, page: page - 1 }) })}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            data-testid="next-page"
            disabled={page >= pages}
            onClick={() => void navigate({ search: (prev) => ({ ...prev, page: page + 1 }) })}
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title="Clear history?"
          confirmLabel="Clear history"
          destructive
          pending={clearing}
          onConfirm={() => void clear()}
          onClose={() => setConfirming(false)}
        >
          Every translation you haven't saved is deleted.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
