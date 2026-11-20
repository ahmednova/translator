import { defineEveryApp } from "@every-app/sdk";

// defineEveryApp types the manifest. The Gateway keeps it; the Worker gets
// the bindings it lists (env.DB), never the file.
export default defineEveryApp({
  id: "translator",
  name: "Translator",
  description:
    "Translate text and Office documents between more than 130 languages, with a private history and saved phrases for each member.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    // Uploaded documents and their translations, under docs/<user>/<job>/.
    r2: ["files"],
    // One run per uploaded document: extract, translate in batches, rebuild.
    workflows: [
      { name: "DOCUMENT_WORKFLOW", className: "DocumentTranslateWorkflow" },
    ],
  },
  ai: {
    chat: {
      why: "Translates text and documents and detects their language.",
    },
  },
});
