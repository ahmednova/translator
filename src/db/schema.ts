import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The members who have used the app, keyed by the Gateway's user id.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: integer("created_at").notNull(),
});

// One row per successful translation. `inHistory` is false once a member
// removed a saved entry from their history; the row stays while `saved`.
export const translations = sqliteTable(
  "translations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    sourceLang: text("source_lang").notNull(),
    detectedLang: text("detected_lang"),
    targetLang: text("target_lang").notNull(),
    sourceText: text("source_text").notNull(),
    translatedText: text("translated_text").notNull(),
    saved: integer("saved", { mode: "boolean" }).notNull().default(false),
    inHistory: integer("in_history", { mode: "boolean" })
      .notNull()
      .default(true),
    savedAt: integer("saved_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("translations_user_created").on(table.userId, table.createdAt),
  ],
);

// A document translation job; the files live in R2 under `docs/<user>/<id>/`.
export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    filename: text("filename").notNull(),
    size: integer("size").notNull(),
    sourceLang: text("source_lang").notNull(),
    detectedLang: text("detected_lang"),
    targetLang: text("target_lang").notNull(),
    // queued | running | done | failed
    status: text("status").notNull(),
    error: text("error"),
    originalKey: text("original_key").notNull(),
    resultKey: text("result_key"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("documents_user_created").on(table.userId, table.createdAt)],
);
