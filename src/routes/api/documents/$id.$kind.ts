import { createFileRoute } from "@tanstack/react-router";
import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { getDocument } from "@/server/documents";
import { translatedName } from "@/server/office";

// A document's original or translated file, for its uploader only. Private
// like every route: the Gateway admits members, and the row's owner is
// checked here.
export const Route = createFileRoute("/api/documents/$id/$kind")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getEveryAppUser(request, env);
        if (!user) return new Response("Not found", { status: 404 });
        const job = await getDocument(user.id, params.id);
        const key =
          params.kind === "original"
            ? job?.originalKey
            : params.kind === "translated"
              ? job?.resultKey
              : null;
        const object = key ? await env.files.get(key) : null;
        if (!job || !object) return new Response("Not found", { status: 404 });
        const name =
          params.kind === "original"
            ? job.filename
            : translatedName(job.filename, job.targetLang);
        return new Response(object.body, {
          headers: {
            "content-type":
              object.httpMetadata?.contentType ?? "application/octet-stream",
            "content-disposition": `attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
            "cache-control": "private, no-store",
          },
        });
      },
    },
  },
});

function asciiName(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
}
