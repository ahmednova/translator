import { languageName } from "@/lib/languages";

/** "English → French", with the detected language when there is one. */
export function pairLabel(entry: {
  sourceLang: string;
  detectedLang: string | null;
  targetLang: string;
}): string {
  return `${languageName(entry.detectedLang ?? entry.sourceLang)} → ${languageName(entry.targetLang)}`;
}

/** A pair key from listSaved ("en>fr") as "English → French". */
export function pairKeyLabel(pair: string): string {
  const [from, to] = pair.split(">");
  return `${languageName(from)} → ${languageName(to)}`;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
