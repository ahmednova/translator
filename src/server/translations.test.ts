import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

// An in-memory SQLite with the app's migrations stands in for D1.
const testDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return testDb.current;
  },
}));

const t = await import("./translations");

beforeAll(async () => {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  testDb.current = db;
});

const row = (text: string, target = "fr") => ({
  sourceLang: "auto",
  detectedLang: "en",
  targetLang: target,
  sourceText: text,
  translatedText: `${text} (${target})`,
});

describe("translations", () => {
  it("refuses empty, over-limit and same-language input", () => {
    const ok = { text: "Hi", source: "auto", target: "fr" };
    expect(t.refusalOf(ok)).toBeNull();
    expect(t.refusalOf({ ...ok, text: "  " })).toMatch(/Enter/);
    expect(t.refusalOf({ ...ok, text: "a".repeat(5001) })).toMatch(/5,000/);
    expect(t.refusalOf({ ...ok, source: "fr" })).toMatch(/different/);
    expect(t.refusalOf({ ...ok, target: "xx" })).toMatch(/target/);
  });

  it("keep each member's history, saved list and pairs apart", async () => {
    const a1 = await t.recordTranslation("alice", row("one"));
    const a2 = await t.recordTranslation("alice", row("two", "de"));
    const b1 = await t.recordTranslation("bob", row("bob's"));

    expect((await t.listHistory("alice", { page: 1, q: "" })).entries.map((e) => e.id))
      .toEqual([a2.id, a1.id]);
    expect(await t.getTranslation("bob", a1.id)).toBeNull();

    await t.setSaved("bob", { id: a1.id, saved: true });
    await t.deleteHistoryEntry("bob", a1.id);
    expect((await t.getTranslation("alice", a1.id))?.saved).toBe(false);

    await t.setSaved("alice", { id: a1.id, saved: true });
    expect((await t.listSaved("alice", { pair: "" })).pairs).toEqual(["en>fr"]);
    expect((await t.listSaved("bob", { pair: "" })).entries).toEqual([]);

    await t.clearHistory("alice");
    expect((await t.listHistory("alice", { page: 1, q: "" })).total).toBe(0);
    expect((await t.listSaved("alice", { pair: "en>fr" })).entries.map((e) => e.id))
      .toEqual([a1.id]);
    expect((await t.listHistory("bob", { page: 1, q: "" })).entries.map((e) => e.id))
      .toEqual([b1.id]);

    // Un-starring an entry already out of history removes it.
    await t.setSaved("alice", { id: a1.id, saved: false });
    expect(await t.getTranslation("alice", a1.id)).toBeNull();
  });

  it("searches both texts", async () => {
    await t.recordTranslation("carol", row("Good night"));
    await t.recordTranslation("carol", row("Thank you"));
    const found = await t.listHistory("carol", { page: 1, q: "NIGHT" });
    expect(found.entries.map((e) => e.sourceText)).toEqual(["Good night"]);
    expect((await t.listHistory("carol", { page: 1, q: "(fr)" })).total).toBe(2);
  });
});
