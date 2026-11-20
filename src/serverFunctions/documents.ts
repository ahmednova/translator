import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { DETECT } from "@/lib/languages";
import * as documents from "@/server/documents";
import { idInput, rememberUser } from "@/server/translations";

export const getDocuments = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => documents.listDocuments(context.user.id));

/** Takes the upload as form data: file, source and target. */
export const startDocument = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data.");
    const file = data.get("file");
    return {
      file: file instanceof File ? file : null,
      source: String(data.get("source") ?? DETECT),
      target: String(data.get("target") ?? ""),
    };
  })
  .handler(async ({ data, context }) => {
    const refused = documents.uploadRefusal(data);
    if (refused) return { refused };
    const created = await documents.createDocument(context.user.id, {
      file: data.file!,
      source: data.source,
      target: data.target,
    });
    if ("refused" in created) return created;
    await rememberUser(context.user);
    await env.DOCUMENT_WORKFLOW.create({
      id: created.job.id,
      params: { jobId: created.job.id },
    });
    return { job: created.job };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(async ({ data, context }) => ({
    deleted: await documents.deleteDocument(context.user.id, data.id),
  }));
