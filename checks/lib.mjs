// Shared pieces of the suites: a local fake of the Gateway's AI route, and
// helpers that drive the pages the way a person does.
import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { strToU8, zipSync, unzipSync, strFromU8 } from "fflate";

export { expect };

// Phrase pairs the fake model knows, so the screens show real-looking text.
const PHRASES = {
  fr: {
    "Where is the train station?": "Où est la gare ?",
    "Could you recommend a good restaurant nearby?":
      "Pourriez-vous recommander un bon restaurant à proximité ?",
    "I would like a table for two, please.":
      "Je voudrais une table pour deux, s'il vous plaît.",
    "Quarterly report": "Rapport trimestriel",
    "Revenue grew by twelve percent this quarter.":
      "Le chiffre d'affaires a augmenté de douze pour cent ce trimestre.",
  },
  de: {
    "Where is the train station?": "Wo ist der Bahnhof?",
    "Good morning, how are you?": "Guten Morgen, wie geht es dir?",
  },
  en: { "Où est la gare ?": "Where is the train station?" },
};

// The fake answers the Gateway's default AI route as an OpenAI-compatible
// chat endpoint. Every other capability call is refused, as a Gateway with
// nothing configured does. POST /__off makes the AI route answer as a
// Gateway without an AI key; /__on restores it.
const FAKE = `
const PHRASES = ${JSON.stringify(PHRASES)};
let off = false;
export default { async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/__off") { off = true; return new Response("ok"); }
  if (url.pathname === "/__on") { off = false; return new Response("ok"); }
  if (url.pathname === "/api/ai/default/v1/chat/completions" && !off) {
    const body = await request.json();
    const last = body.messages[body.messages.length - 1];
    const ask = JSON.parse(typeof last.content === "string" ? last.content : last.content.map((p) => p.text).join(""));
    const french = new Set(Object.values(PHRASES.fr));
    const detected = ask.texts.some((t) => french.has(t)) ? "fr" : "en";
    const translations = ask.texts.map((t) => (PHRASES[ask.to] && PHRASES[ask.to][t]) || "[" + ask.to + "] " + t);
    const content = JSON.stringify({ detected, translations });
    return Response.json({ id: "chatcmpl-local", object: "chat.completion", created: 0, model: "local",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
  }
  const code = url.pathname.startsWith("/api/ai/") ? "ai_default_not_configured" : "integration_not_configured";
  return Response.json({ code, message: "No AI provider is set up.", setup: "Add an AI provider key in the Gateway.", command: "pnpm everyapp provider add openrouter" },
    { status: 503, headers: { "x-everyapp-error": code } });
} };`;

export async function start() {
  return startRuntime({
    bindings: { EVERY_APP_GATEWAY: { type: "worker", worker: "fake-ai-gateway" } },
    workers: [
      {
        config: {
          name: "fake-ai-gateway",
          compatibilityDate: "2026-06-01",
          manifest: { mainModule: "fake.mjs", modules: { "fake.mjs": { type: "esm", contents: FAKE } } },
        },
      },
    ],
  });
}

export async function setAi(runtime, on) {
  const worker = await runtime.mf.getWorker("fake-ai-gateway");
  await worker.fetch(`http://fake/${on ? "__on" : "__off"}`, { method: "POST" });
}

/** Opens a language picker and chooses a language by its name. */
export async function pick(page, testId, name) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByTestId(testId)).toContainText(name);
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/** Translates text on the translator page and waits for the result. */
export async function translate(page, text, target, expected) {
  await page.getByTestId("source-text").fill(text);
  if (target) await pick(page, "target-language", target);
  await page.getByTestId("translate-button").click();
  await expect(page.getByTestId("translation-result")).toHaveText(expected);
}

/** A small Word document: a heading split over two runs (one bold) and a paragraph. */
export function sampleDocx() {
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Quarterly </w:t></w:r><w:r><w:t>report</w:t></w:r></w:p><w:p><w:r><w:t>Revenue grew by twelve percent this quarter.</w:t></w:r></w:p></w:body></w:document>`;
  return Buffer.from(
    zipSync({ "[Content_Types].xml": strToU8(types), "_rels/.rels": strToU8(rels), "word/document.xml": strToU8(doc) }),
  );
}

export function readZipText(buffer, name) {
  const files = unzipSync(new Uint8Array(buffer));
  if (!files[name]) throw new Error(`${name} is missing from the archive`);
  return strFromU8(files[name]);
}

/** Uploads a document on the documents page and returns its row. */
export async function uploadDocument(page, { name, buffer, mimeType, target }) {
  await page.getByTestId("document-file").setInputFiles({ name, mimeType, buffer });
  if (target) await pick(page, "doc-target-language", target);
  await page.getByTestId("start-document").click();
}

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
