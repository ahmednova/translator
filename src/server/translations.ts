import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { translations, users } from "@/db/schema";
import { DETECT, isLanguage, MAX_CHARS } from "@/lib/languages";

export const PAGE_SIZE = 20;

export const translateInput = z
  .object({
    text: z.string().max(MAX_CHARS * 4),
    source: z.string().max(16),
    target: z.string().max(16),
  })
  .strict();
export const idInput = z.object({ id: z.string().min(1).max(64) }).strict();
export const savedInput = idInput.extend({ saved: z.boolean() }).strict();
export const historyInput = z
  .object({
    page: z.number().int().min(1).max(10_000).default(1),
    q: z.string().max(200).default(""),
  })
  .strict();
export const savedListInput = z
  .object({ pair: z.string().max(40).default("") })
  .strict();

/** Why a translation can't start, or null when it can. */
export function refusalOf(
  input: z.infer<typeof translateInput>,
): string | null {
  if (!input.text.trim()) return "Enter some text to translate.";
  if (input.text.length > MAX_CHARS)
    return `Text can be at most ${MAX_CHARS.toLocaleString("en-US")} characters.`;
  if (input.source !== DETECT && !isLanguage(input.source))
    return "Pick a source language.";
  if (!isLanguage(input.target)) return "Pick a target language.";
  if (input.source === input.target) return "Pick two different languages.";
  return null;
}

export interface Entry {
  id: string;
  sourceLang: string;
  detectedLang: string | null;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  saved: boolean;
  createdAt: number;
}

const shown = {
  id: translations.id,
  sourceLang: translations.sourceLang,
  detectedLang: translations.detectedLang,
  targetLang: translations.targetLang,
  sourceText: translations.sourceText,
  translatedText: translations.translatedText,
  saved: translations.saved,
  createdAt: translations.createdAt,
};

/** Keeps a row for each member, from the Gateway's identity, on first sight. */
export async function rememberUser(user: { id: string; email: string }) {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email, createdAt: Date.now() })
    .onConflictDoNothing();
}

export async function recordTranslation(
  userId: string,
  row: Omit<Entry, "id" | "saved" | "createdAt">,
): Promise<Entry> {
  const [entry] = await db
    .insert(translations)
    .values({
      id: crypto.randomUUID(),
      userId,
      ...row,
      createdAt: Date.now(),
    })
    .returning(shown);
  return entry!;
}

export async function getTranslation(
  userId: string,
  id: string,
): Promise<Entry | null> {
  const [entry] = await db
    .select(shown)
    .from(translations)
    .where(and(eq(translations.id, id), eq(translations.userId, userId)));
  return entry ?? null;
}

export async function listHistory(
  userId: string,
  { page, q }: z.infer<typeof historyInput>,
): Promise<{ entries: Entry[]; page: number; pages: number; total: number }> {
  const term = q.trim().toLowerCase();
  const where = and(
    eq(translations.userId, userId),
    eq(translations.inHistory, true),
    term
      ? sql`(instr(lower(${translations.sourceText}), ${term}) > 0 or instr(lower(${translations.translatedText}), ${term}) > 0)`
      : undefined,
  );
  const [counted] = await db
    .select({ total: sql<number>`count(*)` })
    .from(translations)
    .where(where);
  const total = counted?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const entries = await db
    .select(shown)
    .from(translations)
    .where(where)
    .orderBy(desc(translations.createdAt), desc(translations.id))
    .limit(PAGE_SIZE)
    .offset((current - 1) * PAGE_SIZE);
  return { entries, page: current, pages, total };
}

/** Removes an entry from history; a saved one stays in the saved list. */
export async function deleteHistoryEntry(
  userId: string,
  id: string,
): Promise<void> {
  const mine = and(eq(translations.id, id), eq(translations.userId, userId));
  await db.batch([
    db
      .delete(translations)
      .where(and(mine, eq(translations.saved, false))),
    db.update(translations).set({ inHistory: false }).where(mine),
  ]);
}

/** Empties the history; saved entries stay in the saved list. */
export async function clearHistory(userId: string): Promise<void> {
  const mine = eq(translations.userId, userId);
  await db.batch([
    db.delete(translations).where(and(mine, eq(translations.saved, false))),
    db.update(translations).set({ inHistory: false }).where(mine),
  ]);
}

/** Stars or un-stars an entry. Un-starring one already out of history deletes it. */
export async function setSaved(
  userId: string,
  { id, saved }: z.infer<typeof savedInput>,
): Promise<void> {
  const mine = and(eq(translations.id, id), eq(translations.userId, userId));
  if (saved) {
    await db
      .update(translations)
      .set({ saved: true, savedAt: Date.now() })
      .where(mine);
    return;
  }
  await db.batch([
    db
      .delete(translations)
      .where(and(mine, eq(translations.inHistory, false))),
    db
      .update(translations)
      .set({ saved: false, savedAt: null })
      .where(mine),
  ]);
}

const pairOf = sql<string>`coalesce(${translations.detectedLang}, ${translations.sourceLang}) || '>' || ${translations.targetLang}`;

export async function listSaved(
  userId: string,
  { pair }: z.infer<typeof savedListInput>,
): Promise<{ entries: Entry[]; pairs: string[] }> {
  const mine = and(
    eq(translations.userId, userId),
    eq(translations.saved, true),
  );
  const [entries, pairs] = await Promise.all([
    db
      .select(shown)
      .from(translations)
      .where(and(mine, pair ? sql`${pairOf} = ${pair}` : undefined))
      .orderBy(desc(translations.savedAt), desc(translations.id))
      .limit(500),
    db
      .selectDistinct({ pair: pairOf })
      .from(translations)
      .where(mine)
      .orderBy(pairOf),
  ]);
  return { entries, pairs: pairs.map((row) => row.pair) };
}
