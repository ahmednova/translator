import {
  env,
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { DETECT } from "@/lib/languages";
import { jobForWorkflow, updateJob } from "@/server/documents";
import { ModelNotConfigured, translateTexts } from "@/server/model";
import {
  applyTranslations,
  extractSegments,
  officeKind,
  OFFICE_TYPES,
  translatedName,
} from "@/server/office";

export interface DocumentJobParams {
  jobId: string;
}

// What one model call takes: a few dozen paragraphs at most.
const BATCH_SEGMENTS = 40;
const BATCH_CHARS = 6000;
const MAX_BATCHES = 800;

const MODEL_STEP = {
  retries: { limit: 3, delay: "5 seconds" as const, backoff: "exponential" as const },
  timeout: "3 minutes" as const,
};

/**
 * Translates one uploaded document: its paragraphs go to the model in
 * batches, one step each, then the translations go back into a copy of the
 * file. The job row follows along: running, then done or failed.
 */
export class DocumentTranslateWorkflow extends WorkflowEntrypoint<
  Env,
  DocumentJobParams
> {
  async run(event: WorkflowEvent<DocumentJobParams>, step: WorkflowStep) {
    const { jobId } = event.payload;
    try {
      const plan = await step.do("read the document", async () => {
        const job = await jobForWorkflow(jobId);
        if (!job) return null;
        await updateJob(jobId, { status: "running", error: null });
        const original = await env.files.get(job.originalKey);
        if (!original) throw new NonRetryableError("The uploaded file is missing.");
        const kind = officeKind(job.filename)!;
        const segments = extractSegments(
          kind,
          new Uint8Array(await original.arrayBuffer()),
        );
        const batches = batch(segments);
        if (batches.length > MAX_BATCHES) {
          throw new NonRetryableError("The document has too much text.");
        }
        await env.files.put(segmentsKey(job.originalKey), JSON.stringify(segments));
        return {
          batches,
          source: job.sourceLang,
          target: job.targetLang,
          originalKey: job.originalKey,
          filename: job.filename,
        };
      });
      if (!plan) return;

      let detected: string | null = plan.source === DETECT ? null : plan.source;
      const translated: string[] = [];
      for (const [index, [start, end]] of plan.batches.entries()) {
        const answer = await step.do(`translate part ${index + 1}`, MODEL_STEP, async () => {
          const stored = await env.files.get(segmentsKey(plan.originalKey));
          if (!stored) throw new NonRetryableError("The document's text is missing.");
          const segments = (await stored.json()) as string[];
          try {
            return await translateTexts({
              texts: segments.slice(start, end),
              from: plan.source === DETECT && detected ? detected : plan.source,
              to: plan.target,
              background: true,
            });
          } catch (error) {
            if (error instanceof ModelNotConfigured) {
              throw new NonRetryableError(`No AI model is set up. ${error.message}`);
            }
            throw error;
          }
        });
        detected ??= answer.detected;
        translated.push(...answer.translations);
      }

      await step.do("write the translation", async () => {
        const original = await env.files.get(plan.originalKey);
        if (!original) throw new NonRetryableError("The uploaded file is missing.");
        const kind = officeKind(plan.filename)!;
        const result = applyTranslations(
          kind,
          new Uint8Array(await original.arrayBuffer()),
          translated,
        );
        const resultKey = plan.originalKey.replace(
          /original$/,
          translatedName(plan.filename, plan.target),
        );
        await env.files.put(resultKey, result, {
          httpMetadata: { contentType: OFFICE_TYPES[kind] },
        });
        await env.files.delete(segmentsKey(plan.originalKey));
        await updateJob(jobId, {
          status: "done",
          error: null,
          detectedLang: detected,
          resultKey,
        });
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message
          ? error.message
          : "The translation failed.";
      await step.do("record the failure", async () => {
        await updateJob(jobId, { status: "failed", error: reason.slice(0, 500) });
      });
    }
  }
}

function segmentsKey(originalKey: string): string {
  return originalKey.replace(/original$/, "segments.json");
}

/** Index ranges of the segments, each small enough for one model call. */
function batch(segments: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  let start = 0;
  let chars = 0;
  for (const [index, segment] of segments.entries()) {
    const full = index - start >= BATCH_SEGMENTS || chars + segment.length > BATCH_CHARS;
    if (index > start && full) {
      ranges.push([start, index]);
      start = index;
      chars = 0;
    }
    chars += segment.length;
  }
  if (segments.length > start) ranges.push([start, segments.length]);
  return ranges;
}
