// Behavior: every retained feature's main path, through the pages and the
// download route, against the packaged release.
import {
  start, setAi, pick, translate, expect, sampleDocx, readZipText, uploadDocument, DOCX_TYPE,
} from "./lib.mjs";

const runtime = await start();
try {
  const context = await runtime.context("owner");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://${runtime.hostname}` });
  const page = await context.newPage();

  // F001 Text translation
  await page.goto("/");
  await runtime.assertBackLink(page);
  await expect(page.getByTestId("source-language")).toContainText("Detect language");

  // Empty and over-limit input are refused with a message.
  await page.getByTestId("translate-button").click();
  await expect(page.getByTestId("translate-error")).toContainText("Enter some text");
  await page.getByTestId("source-text").fill("a".repeat(5001));
  await expect(page.getByTestId("char-count")).toContainText("5,001 / 5,000");
  await page.getByTestId("translate-button").click();
  await expect(page.getByTestId("translate-error")).toContainText("5,000");

  // Source equal to target is refused.
  await page.getByTestId("source-text").fill("Where is the train station?");
  await pick(page, "source-language", "French");
  await pick(page, "target-language", "French");
  await page.getByTestId("translate-button").click();
  await expect(page.getByTestId("translate-error")).toContainText("different");

  // A detected translation shows the detected language.
  await pick(page, "source-language", "Detect language");
  await translate(page, "Where is the train station?", "French", "Où est la gare ?");
  await expect(page.getByTestId("detected-language")).toContainText("English");

  // Copy puts the translation on the clipboard.
  await page.getByTestId("copy-translation").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Où est la gare ?");

  // Star it from the result.
  await page.getByTestId("save-translation").click();
  await expect(page.getByTestId("save-translation")).toHaveAttribute("aria-pressed", "true");

  // Swap moves the translation into the input and exchanges the languages.
  await page.getByTestId("swap-languages").click();
  await expect(page.getByTestId("source-text")).toHaveValue("Où est la gare ?");
  await expect(page.getByTestId("source-language")).toContainText("French");
  await expect(page.getByTestId("target-language")).toContainText("English");
  await page.getByTestId("translate-button").click();
  await expect(page.getByTestId("translation-result")).toHaveText("Where is the train station?");

  await pick(page, "source-language", "Detect language");
  await translate(page, "Good morning, how are you?", "German", "Guten Morgen, wie geht es dir?");

  // With no AI model set up, the page shows setup information instead.
  await setAi(runtime, false);
  await page.getByTestId("source-text").fill("I would like a table for two, please.");
  await page.getByTestId("translate-button").click();
  await expect(page.getByTestId("ai-setup")).toContainText("Add an AI provider key in the Gateway.");
  await expect(page.getByTestId("translation-result")).toHaveCount(0);
  await setAi(runtime, true);

  // F002 History: newest first, with pair, text, translation and time.
  await page.getByRole("link", { name: "History" }).click();
  const entries = page.getByTestId("history-entry");
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText("Guten Morgen, wie geht es dir?");
  await expect(entries.nth(0)).toContainText("English → German");
  await expect(entries.nth(2)).toContainText("Where is the train station?");
  await expect(entries.nth(2)).toContainText("Où est la gare ?");
  await expect(entries.nth(2).getByTestId("entry-time")).not.toBeEmpty();

  // Search.
  await page.getByTestId("history-search").fill("Bahnhof");
  await expect(entries).toHaveCount(0);
  await page.getByTestId("history-search").fill("Good morning");
  await expect(entries).toHaveCount(1);
  await page.getByTestId("history-search").fill("");
  await expect(entries).toHaveCount(3);

  // Reopen an entry in the translator.
  await entries.nth(0).getByTestId("open-entry").click();
  await expect(page).toHaveURL(/\/\?id=/);
  await expect(page.getByTestId("source-text")).toHaveValue("Good morning, how are you?");
  await expect(page.getByTestId("translation-result")).toHaveText("Guten Morgen, wie geht es dir?");
  await expect(page.getByTestId("target-language")).toContainText("German");

  // Star from history, then delete one entry.
  await page.getByRole("link", { name: "History" }).click();
  await entries.nth(0).getByTestId("save-toggle").click();
  await expect(entries.nth(0).getByTestId("save-toggle")).toHaveAttribute("aria-pressed", "true");
  await entries.nth(1).getByTestId("delete-entry").click();
  await expect(entries).toHaveCount(2);
  await expect(page.getByText("Where is the train station?", { exact: true })).toHaveCount(1);

  // F003 Saved: both starred entries, filterable by pair.
  await page.getByRole("link", { name: "Saved" }).click();
  const saved = page.getByTestId("saved-entry");
  await expect(saved).toHaveCount(2);
  await pick(page, "pair-filter", "English → French");
  await expect(saved).toHaveCount(1);
  await expect(saved.first()).toContainText("Où est la gare ?");
  await pick(page, "pair-filter", "All language pairs");
  await expect(saved).toHaveCount(2);

  // Clearing history (after confirming) keeps saved entries.
  await page.getByRole("link", { name: "History" }).click();
  await page.getByTestId("clear-history").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear history" }).click();
  await expect(entries).toHaveCount(0);
  await page.getByRole("link", { name: "Saved" }).click();
  await expect(saved).toHaveCount(2);

  // Un-star removes it from the list.
  await saved.filter({ hasText: "Guten Morgen" }).getByTestId("save-toggle").click();
  await expect(saved).toHaveCount(1);

  // History pages through 20 at a time.
  const db = await runtime.database();
  const now = Date.now();
  await db.batch(
    Array.from({ length: 23 }, (_, i) =>
      db.prepare(
        "INSERT INTO translations (id, user_id, source_lang, detected_lang, target_lang, source_text, translated_text, saved, in_history, created_at) VALUES (?, 'owner', 'auto', 'en', 'es', ?, ?, 0, 1, ?)",
      ).bind(`seed-${i}`, `Phrase number ${i}`, `Frase número ${i}`, now - 60_000 - i * 1000),
    ),
  );
  await page.getByRole("link", { name: "History" }).click();
  await expect(entries).toHaveCount(20);
  await expect(page.getByTestId("page-indicator")).toContainText("1 of 2");
  await page.getByTestId("next-page").click();
  await expect(entries).toHaveCount(3);
  await expect(page.getByTestId("page-indicator")).toContainText("2 of 2");

  // F004 Document translation.
  await page.getByRole("link", { name: "Documents" }).click();
  await uploadDocument(page, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByTestId("document-error")).toContainText(".docx, .pptx or .xlsx");
  await uploadDocument(page, {
    name: "big.docx", mimeType: DOCX_TYPE, buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1),
  });
  await expect(page.getByTestId("document-error")).toContainText("10 MB");

  const original = sampleDocx();
  await uploadDocument(page, { name: "Quarterly report.docx", mimeType: DOCX_TYPE, buffer: original, target: "French" });
  const row = page.getByTestId("document-row").filter({ hasText: "Quarterly report.docx" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("French");
  await expect(row.getByTestId("document-status")).toHaveText("Done", { timeout: 30_000 });
  await expect(row).toContainText("English");

  const translatedHref = await row.getByTestId("download-translated").getAttribute("href");
  const originalHref = await row.getByTestId("download-original").getAttribute("href");
  const translated = await runtime.fetch(translatedHref, { role: "owner" });
  expect(translated.status).toBe(200);
  expect(translated.headers.get("content-type")).toContain("wordprocessingml");
  expect(translated.headers.get("content-disposition")).toContain("Quarterly report.fr.docx");
  const xml = readZipText(Buffer.from(await translated.arrayBuffer()), "word/document.xml");
  expect(xml).toContain("Rapport trimestriel");
  expect(xml).toContain("Le chiffre d'affaires a augmenté de douze pour cent ce trimestre.");
  expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
  expect(xml).toContain("<w:b/>");
  const back = await runtime.fetch(originalHref, { role: "owner" });
  expect(back.status).toBe(200);
  expect(Buffer.from(await back.arrayBuffer()).equals(original)).toBe(true);

  // A job that cannot reach a model fails with a reason.
  await setAi(runtime, false);
  await uploadDocument(page, { name: "Menu.docx", mimeType: DOCX_TYPE, buffer: sampleDocx() });
  const failed = page.getByTestId("document-row").filter({ hasText: "Menu.docx" });
  await expect(failed.getByTestId("document-status")).toHaveText("Failed", { timeout: 30_000 });
  await expect(failed).toContainText("AI");
  await setAi(runtime, true);

  // Delete a job and its files.
  await failed.getByTestId("delete-document").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(failed).toHaveCount(0);

  // Phone-sized smoke.
  const phone = await runtime.context("member", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const small = await phone.newPage();
  await small.goto("/");
  await expect(small.getByTestId("source-text")).toBeVisible();
  await expect(small.getByTestId("translate-button")).toBeVisible();
  await expect(small.getByRole("link", { name: "Documents" })).toBeVisible();
  expect(await small.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await phone.close();

  // End of the journey: a fresh translation on screen.
  await page.getByRole("link", { name: "Translate" }).click();
  await translate(page, "Could you recommend a good restaurant nearby?", "French",
    "Pourriez-vous recommander un bon restaurant à proximité ?");
  await expect(page.getByTestId("detected-language")).toContainText("English");
  await runtime.screenshot(page);
} finally {
  await runtime.close();
}
