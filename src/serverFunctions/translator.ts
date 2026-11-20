import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { translateForUser } from "@/server/translate";
import * as translations from "@/server/translations";

// Each server function runs behind ensureUserMiddleware: `context.user` is
// the person the Gateway signed in, and every query takes their id.

export const translateText = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => translations.translateInput.parse(data))
  .handler(({ data, context }) => translateForUser(context.user, data));

export const getEntry = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => translations.idInput.parse(data))
  .handler(({ data, context }) =>
    translations.getTranslation(context.user.id, data.id),
  );

export const getHistory = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => translations.historyInput.parse(data))
  .handler(({ data, context }) =>
    translations.listHistory(context.user.id, data),
  );

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => translations.idInput.parse(data))
  .handler(({ data, context }) =>
    translations.deleteHistoryEntry(context.user.id, data.id),
  );

export const clearHistory = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => translations.clearHistory(context.user.id));

export const setSaved = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => translations.savedInput.parse(data))
  .handler(({ data, context }) =>
    translations.setSaved(context.user.id, data),
  );

export const getSaved = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => translations.savedListInput.parse(data))
  .handler(({ data, context }) =>
    translations.listSaved(context.user.id, data),
  );
