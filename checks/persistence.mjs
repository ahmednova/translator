// Persistence: history, saved entries and documents survive a restart.
import { start, translate, expect, sampleDocx, readZipText, uploadDocument, DOCX_TYPE } from "./lib.mjs";

const runtime = await start();
try {
  let page = await (await runtime.context("owner")).newPage();
  await page.goto("/");
  await translate(page, "Where is the train station?", "French", "Où est la gare ?");
  await page.getByTestId("save-translation").click();
  await expect(page.getByTestId("save-translation")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Documents" }).click();
  await uploadDocument(page, { name: "Quarterly report.docx", mimeType: DOCX_TYPE, buffer: sampleDocx(), target: "French" });
  const row = page.getByTestId("document-row").filter({ hasText: "Quarterly report.docx" });
  await expect(row.getByTestId("document-status")).toHaveText("Done", { timeout: 30_000 });
  const href = await row.getByTestId("download-translated").getAttribute("href");

  await runtime.restart();

  page = await (await runtime.context("owner")).newPage();
  await page.goto("/history");
  await expect(page.getByTestId("history-entry")).toHaveCount(1);
  await expect(page.getByTestId("history-entry").first()).toContainText("Où est la gare ?");
  await page.goto("/saved");
  await expect(page.getByTestId("saved-entry")).toHaveCount(1);
  await expect(page.getByTestId("saved-entry").first()).toContainText("Where is the train station?");
  await page.goto("/documents");
  const after = page.getByTestId("document-row").filter({ hasText: "Quarterly report.docx" });
  await expect(after.getByTestId("document-status")).toHaveText("Done");
  const file = await runtime.fetch(href, { role: "owner" });
  expect(file.status).toBe(200);
  expect(readZipText(Buffer.from(await file.arrayBuffer()), "word/document.xml")).toContain("Rapport trimestriel");
} finally {
  await runtime.close();
}
