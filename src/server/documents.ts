import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { DETECT, isLanguage } from "@/lib/languages";
import {
  isOfficeFile,
  MAX_DOCUMENT_BYTES,
  officeKind,
  OFFICE_TYPES,
} from "@/server/office";

export type DocumentStatus = "queued" | "running" | "done" | "failed";

export interface DocumentJob {
  id: string;
  filename: string;
  size: number;
  sourceLang: string;
  detectedLang: string | null;
  targetLang: string;
  status: DocumentStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const shown = {
  id: documents.id,
  filename: documents.filename,
  size: documents.size,
  sourceLang: documents.sourceLang,
  detectedLang: documents.detectedLang,
  targetLang: documents.targetLang,
  status: documents.status,
  error: documents.error,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

export const TYPE_REFUSAL = "Choose a .docx, .pptx or .xlsx file.";
export const SIZE_REFUSAL = "Files can be at most 10 MB.";

/** Why this upload can't be translated, or null when it can. */
export function uploadRefusal(input: {
  file: File | null;
  source: string;
  target: string;
}): string | null {
  if (!input.file || input.file.size === 0) return "Choose a file.";
  if (!officeKind(input.file.name)) return TYPE_REFUSAL;
  if (input.file.size > MAX_DOCUMENT_BYTES) return SIZE_REFUSAL;
  if (input.source !== DETECT && !isLanguage(input.source))
    return "Pick a source language.";
  if (!isLanguage(input.target)) return "Pick a target language.";
  if (input.source === input.target) return "Pick two different languages.";
  return null;
}

/** Stores the upload and its job row. The caller starts the Workflow. */
export async function createDocument(
  userId: string,
  input: { file: File; source: string; target: string },
): Promise<{ job: DocumentJob } | { refused: string }> {
  const kind = officeKind(input.file.name)!;
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  if (!isOfficeFile(kind, bytes)) {
    return { refused: `This file isn't a readable .${kind} file.` };
  }
  const id = crypto.randomUUID();
  const originalKey = `docs/${userId}/${id}/original`;
  await env.files.put(originalKey, bytes, {
    httpMetadata: { contentType: OFFICE_TYPES[kind] },
  });
  const now = Date.now();
  const [job] = await db
    .insert(documents)
    .values({
      id,
      userId,
      filename: input.file.name.slice(0, 200),
      size: bytes.byteLength,
      sourceLang: input.source,
      targetLang: input.target,
      status: "queued",
      originalKey,
      createdAt: now,
      updatedAt: now,
    })
    .returning(shown);
  return { job: job as DocumentJob };
}

export async function listDocuments(userId: string): Promise<DocumentJob[]> {
  const rows = await db
    .select(shown)
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(200);
  return rows as DocumentJob[];
}

/** The job with its storage keys, only for its owner. */
export async function getDocument(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  return row ?? null;
}

/** Deletes the job and its files. False when the member has no such job. */
export async function deleteDocument(
  userId: string,
  id: string,
): Promise<boolean> {
  const row = await getDocument(userId, id);
  if (!row) return false;
  await env.files.delete(
    [row.originalKey, row.resultKey].filter((key): key is string => !!key),
  );
  await db
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  return true;
}

// The Workflow's updates, by job id: it only runs for a job a member created.

export async function jobForWorkflow(id: string) {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  return row ?? null;
}

export async function updateJob(
  id: string,
  change: Partial<{
    status: DocumentStatus;
    error: string | null;
    detectedLang: string | null;
    resultKey: string;
  }>,
) {
  await db
    .update(documents)
    .set({ ...change, updatedAt: Date.now() })
    .where(eq(documents.id, id));
}
