import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppNav } from "@/client/components/AppNav";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { EntryCard } from "@/client/components/EntryCard";
import { PageHeader } from "@/client/components/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { pairKeyLabel } from "@/client/lib/format";
import { getSaved, setSaved } from "@/serverFunctions/translator";

const ALL = "all";

export const Route = createFileRoute("/saved")({
  validateSearch: z.object({ pair: z.string().max(40).optional() }),
  loaderDeps: ({ search }) => ({ pair: search.pair ?? "" }),
  loader: ({ deps }) => getSaved({ data: deps }),
  head: () => ({ meta: [{ title: "Saved · Translator" }] }),
  component: SavedPage,
});

function SavedPage() {
  const { entries, pairs } = Route.useLoaderData();
  const { pair = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/saved" });
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const items = [
    { value: ALL, label: "All language pairs" },
    ...pairs.map((key) => ({ value: key, label: pairKeyLabel(key) })),
  ];

  async function unsave(id: string) {
    setBusy(id);
    try {
      await setSaved({ data: { id, saved: false } });
      await router.invalidate();
    } catch {
      toast.error("That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell nav={<AppNav />}>
      <PageHeader
        title="Saved"
        actions={
          pairs.length > 0 ? (
            <Select
              items={items}
              value={pair || ALL}
              onValueChange={(next) =>
                void navigate({
                  search: { pair: next && next !== ALL ? String(next) : undefined },
                })
              }
            >
              <SelectTrigger
                aria-label="Language pair"
                data-testid="pair-filter"
                className="w-56 bg-card"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        }
      />
      {entries.length === 0 ? (
        <div data-testid="saved-empty">
          {pair ? (
            <EmptyState kind="filtered" title="Nothing saved for this pair." />
          ) : (
            <EmptyState
              icon={Star}
              title="Nothing saved yet"
              description="Star a translation to keep it here."
            />
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              testId="saved-entry"
              busy={busy === entry.id}
              onToggleSaved={() => void unsave(entry.id)}
            />
          ))}
        </ul>
      )}
    </AppShell>
  );
}
