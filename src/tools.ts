// The app's tools for AI clients. The Gateway serves them at /mcp and calls
// each with the signed-in user; every one reads or writes only that
// member's own translations.
import { ToolError, defineTools } from "@every-app/sdk/server";
import { translateForUser } from "@/server/translate";
import * as translations from "@/server/translations";

export const tools = defineTools({
  translate_text: {
    description:
      'Translate text (at most 5,000 characters). source is a language code such as "en", or "auto" to detect it; target is a language code. The translation is added to the user\'s history.',
    risk: "write",
    idempotent: false,
    input: translations.translateInput,
    handler: async (input, { user }) => {
      const result = await translateForUser(user, input);
      if (result.status === "ok") return result.entry;
      if (result.status === "setup")
        throw new ToolError(result.setup ?? "No AI model is set up.");
      throw new ToolError(result.message);
    },
  },
  search_history: {
    description:
      "List the user's past translations, newest first, 20 per page; q filters by text.",
    risk: "read",
    input: translations.historyInput,
    handler: (input, { user }) => translations.listHistory(user.id, input),
  },
  list_saved: {
    description:
      'List the user\'s saved translations. pair filters by language pair, as "en>fr".',
    risk: "read",
    input: translations.savedListInput,
    handler: (input, { user }) => translations.listSaved(user.id, input),
  },
});
