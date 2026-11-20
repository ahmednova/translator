# Translator

Translate text and Word, PowerPoint and Excel files between more than 130 languages. Each member keeps a private history and a list of saved phrases.

Inspired by https://translate.google.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Translate up to 5,000 characters, with the source language picked or detected, swap and copy.
- Look back through your own translation history: search, page, reopen, delete or clear it.
- Star translations to keep them in a saved list you can filter by language pair.
- Translate .docx, .pptx and .xlsx files up to 10 MB in place and download the result.

Left out: accounts and sign-in, which your Gateway handles; image, website and PDF translation; listening, speech and handwriting input; dictionary details and sharing; the mobile app's camera, offline and conversation modes.

## Setup

- Install: `pnpm install`.
- Run: `pnpm dev`, then open the address it prints.
- Test: `pnpm test` for the queries and the document rewriting; `checks/` holds the release suites, which need the oss.new runtime.
- Deploy: `pnpm run deploy` to your EveryApp Gateway.

There are no secrets or settings. Translation uses your workspace's default AI model (`pnpm everyapp ai show`); until one is set up, the app shows what to set instead of a translation. The database, file storage and the document Workflow are created by the deploy.

## Limitations

- Translation quality and speed depend on the workspace's default AI model, and each translation counts toward its usage.
- Documents keep each paragraph's first-run formatting; mixed formatting inside a paragraph (a bold word, say) collapses to it. Text inside images, charts and SmartArt stays untranslated.
- PDFs and older .doc, .ppt and .xls files are refused.
- The release checks ran against a local stand-in for the AI model, not a real provider.
