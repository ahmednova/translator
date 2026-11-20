// Authorization: private paths, per-member privacy of history, saved
// entries and documents, and no sign-in of the app's own (X001).
import { start, translate, expect, sampleDocx, uploadDocument, DOCX_TYPE } from "./lib.mjs";

const runtime = await start();
try {
  await runtime.assertPrivateAccess(["/", "/history", "/saved", "/documents", "/?id=missing"]);

  // The owner translates, stars one entry and uploads a document.
  const ownerPage = await (await runtime.context("owner")).newPage();
  await ownerPage.goto("/");
  await translate(ownerPage, "Where is the train station?", "French", "Où est la gare ?");
  await ownerPage.getByTestId("save-translation").click();
  await expect(ownerPage.getByTestId("save-translation")).toHaveAttribute("aria-pressed", "true");
  await translate(ownerPage, "I would like a table for two, please.", null,
    "Je voudrais une table pour deux, s'il vous plaît.");
  await ownerPage.getByRole("link", { name: "Documents" }).click();
  await uploadDocument(ownerPage, { name: "Budget.docx", mimeType: DOCX_TYPE, buffer: sampleDocx(), target: "French" });
  const ownerRow = ownerPage.getByTestId("document-row").filter({ hasText: "Budget.docx" });
  await expect(ownerRow.getByTestId("document-status")).toHaveText("Done", { timeout: 30_000 });
  const translatedHref = await ownerRow.getByTestId("download-translated").getAttribute("href");
  const originalHref = await ownerRow.getByTestId("download-original").getAttribute("href");

  const db = await runtime.database();
  const { results: ownerRows } = await db
    .prepare("SELECT id, source_text FROM translations WHERE user_id = 'owner' ORDER BY created_at")
    .all();
  expect(ownerRows.length).toBe(2);
  const [first, second] = ownerRows;

  // Anonymous and outsider callers cannot fetch a document.
  for (const role of [undefined, "outsider"]) {
    for (const href of [translatedHref, originalHref]) {
      const response = await runtime.fetch(href, role ? { role } : {});
      expect(response.status).not.toBe(200);
      expect(response.headers.get("content-type") ?? "").not.toContain("wordprocessingml");
    }
  }

  // Another member sees none of it.
  const memberPage = await (await runtime.context("member")).newPage();
  await memberPage.goto("/history");
  await expect(memberPage.getByTestId("history-empty")).toBeVisible();
  await expect(memberPage.getByText("Where is the train station?")).toHaveCount(0);
  await memberPage.goto("/saved");
  await expect(memberPage.getByTestId("saved-empty")).toBeVisible();
  await memberPage.goto("/documents");
  await expect(memberPage.getByTestId("documents-empty")).toBeVisible();
  await memberPage.goto(`/?id=${first.id}`);
  await expect(memberPage.getByTestId("source-text")).toHaveValue("");
  await expect(memberPage.getByText("Où est la gare ?")).toHaveCount(0);
  for (const href of [translatedHref, originalHref]) {
    const response = await runtime.fetch(href, { role: "member" });
    expect(response.status).toBe(404);
  }

  // A member's own entry is invisible to the owner, who is an admin.
  await memberPage.goto("/");
  await translate(memberPage, "Good morning, how are you?", "German", "Guten Morgen, wie geht es dir?");
  await ownerPage.goto("/history");
  await expect(ownerPage.getByTestId("history-entry")).toHaveCount(2);
  await expect(ownerPage.getByText("Good morning, how are you?")).toHaveCount(0);

  // Replaying the owner's own delete and un-star calls as the member, aimed
  // at the owner's other entry, changes nothing.
  const capture = async (action) => {
    const [request] = await Promise.all([
      ownerPage.waitForRequest((r) => r.method() === "POST" && r.url().includes("_serverFn")),
      action(),
    ]);
    return request;
  };
  const ownerEntries = ownerPage.getByTestId("history-entry");
  const unstar = await capture(() =>
    ownerEntries.filter({ hasText: "Où est la gare ?" }).getByTestId("save-toggle").click());
  await expect(ownerEntries.filter({ hasText: "Où est la gare ?" }).getByTestId("save-toggle"))
    .toHaveAttribute("aria-pressed", "false");
  const remove = await capture(() =>
    ownerEntries.filter({ hasText: "Où est la gare ?" }).getByTestId("delete-entry").click());
  await expect(ownerEntries).toHaveCount(1);
  for (const request of [unstar, remove]) {
    expect(request.postData()).toContain(first.id);
    const headers = { ...request.headers() };
    for (const name of ["cookie", "host", "content-length"]) delete headers[name];
    const response = await runtime.fetch(new URL(request.url()).pathname + new URL(request.url()).search, {
      role: "member", method: "POST", headers, body: request.postData().replaceAll(first.id, second.id),
    });
    expect(response.status).toBeLessThan(500);
  }
  const survivor = await db.prepare("SELECT source_text, in_history FROM translations WHERE id = ?").bind(second.id).first();
  expect(survivor?.source_text).toBe("I would like a table for two, please.");
  expect(survivor?.in_history).toBe(1);

  // Documents: the member cannot delete the owner's job by replaying it.
  await ownerPage.goto("/documents");
  await uploadDocument(ownerPage, { name: "Spare.docx", mimeType: DOCX_TYPE, buffer: sampleDocx() });
  await expect(ownerPage.getByTestId("document-row").filter({ hasText: "Spare.docx" })).toHaveCount(1);
  const { results: docs } = await db.prepare("SELECT id, filename FROM documents WHERE user_id = 'owner'").all();
  const spare = docs.find((d) => d.filename === "Spare.docx");
  const budget = docs.find((d) => d.filename === "Budget.docx");
  const spareRow = ownerPage.getByTestId("document-row").filter({ hasText: "Spare.docx" });
  const deleteDoc = await capture(async () => {
    await spareRow.getByTestId("delete-document").click();
    await ownerPage.getByRole("button", { name: "Delete", exact: true }).click();
  });
  await expect(spareRow).toHaveCount(0);
  const replay = deleteDoc.postData().replaceAll(spare.id, budget.id);
  const headers = { ...deleteDoc.headers() };
  for (const name of ["cookie", "host", "content-length"]) delete headers[name];
  await runtime.fetch(new URL(deleteDoc.url()).pathname, { role: "member", method: "POST", headers, body: replay });
  expect(await db.prepare("SELECT id FROM documents WHERE id = ?").bind(budget.id).first()).not.toBeNull();
  expect((await runtime.fetch(originalHref, { role: "owner" })).status).toBe(200);

  // No sign-in page of the app's own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/logout"]) {
    const member = await runtime.fetch(path, { role: "member" });
    expect(member.status).toBe(404);
    const anonymous = await runtime.fetch(path);
    expect(anonymous.status).not.toBe(200);
    expect(await anonymous.text()).not.toMatch(/type=["']?password/i);
  }
} finally {
  await runtime.close();
}
