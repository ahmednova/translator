import type { z } from "zod";
import { DETECT } from "@/lib/languages";
import { ModelNotConfigured, translateTexts } from "@/server/model";
import {
  recordTranslation,
  refusalOf,
  rememberUser,
  type Entry,
  type translateInput,
} from "@/server/translations";

export type TranslateResult =
  | { status: "ok"; entry: Entry }
  | { status: "invalid"; message: string }
  | { status: "setup"; setup: string | null; command: string | null }
  | { status: "error"; message: string };

/** Translates one text for a member and records it in their history. */
export async function translateForUser(
  user: { id: string; email: string },
  input: z.infer<typeof translateInput>,
): Promise<TranslateResult> {
  const refused = refusalOf(input);
  if (refused) return { status: "invalid", message: refused };
  try {
    const answer = await translateTexts({
      texts: [input.text],
      from: input.source,
      to: input.target,
    });
    await rememberUser(user);
    const entry = await recordTranslation(user.id, {
      sourceLang: input.source,
      detectedLang: input.source === DETECT ? answer.detected : input.source,
      targetLang: input.target,
      sourceText: input.text,
      translatedText: answer.translations[0]!,
    });
    return { status: "ok", entry };
  } catch (error) {
    if (error instanceof ModelNotConfigured) {
      return { status: "setup", setup: error.setup, command: error.command };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "The translation failed.",
    };
  }
}
