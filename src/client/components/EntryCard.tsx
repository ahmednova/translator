import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Star, Trash2 } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { formatTime, pairLabel } from "@/client/lib/format";
import type { Entry } from "@/server/translations";

/** One past translation: its pair, both texts, and what can be done with it. */
export function EntryCard({
  entry,
  testId,
  onToggleSaved,
  onDelete,
  busy,
}: {
  entry: Entry;
  testId: string;
  onToggleSaved: () => void;
  onDelete?: () => void;
  busy?: boolean;
}) {
  return (
    <li
      data-testid={testId}
      className="space-y-3 rounded-xl border border-border bg-card px-5 py-4 text-card-foreground shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="soft">{pairLabel(entry)}</Badge>
          <time
            data-testid="entry-time"
            dateTime={new Date(entry.createdAt).toISOString()}
            className="text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            {formatTime(entry.createdAt)}
          </time>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open in translator"
            data-testid="open-entry"
            render={<Link to="/" search={{ id: entry.id }} />}
            nativeButton={false}
          >
            <ArrowUpRight />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={entry.saved ? "Remove from saved" : "Save"}
            aria-pressed={entry.saved}
            data-testid="save-toggle"
            disabled={busy}
            onClick={onToggleSaved}
            className={entry.saved ? "text-primary" : "text-muted-foreground"}
          >
            <Star className={entry.saved ? "fill-current" : undefined} />
          </Button>
          {onDelete ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete"
              data-testid="delete-entry"
              disabled={busy}
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="text-sm break-words whitespace-pre-wrap">
          {entry.sourceText}
        </p>
        <p className="text-sm font-medium break-words whitespace-pre-wrap">
          {entry.translatedText}
        </p>
      </div>
    </li>
  );
}
