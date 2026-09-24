# Culebra AI Spell Correct Requirements

Current plugin version: 4.4.18. This is a documentation and release-metadata update; runtime requirements are unchanged.

## Purpose

Culebra is an Obsidian plugin that uses OpenRouter (an OpenAI-compatible chat completions API) to correct spelling, grammar, capitalization, punctuation, and light readability issues in Rahul's notes.

The plugin must improve the surface quality of the text without changing what the user meant.

## User Flow

1. User opens an Obsidian Markdown note.
2. User selects text and right-clicks.
3. User clicks `Culebra AI Spell Correct`.
4. If text is selected, only the selected text is sent to the AI and replaced.
5. If no text is selected, the whole current note is sent to the AI and replaced.
6. User may also right-click a Markdown file in the file explorer and run the same correction on the whole file.

## AI Model And Endpoint

- Provider: OpenRouter (`https://openrouter.ai`), an OpenAI-compatible chat completions router.
- Endpoint family: OpenRouter Chat Completions API (`POST /api/v1/chat/completions`).
- Default model: `openai/gpt-5-mini` (configurable in settings).
- A user-supplied OpenRouter API key in settings takes precedence and is stored in local plugin data. When the field is blank, the plugin loads its dedicated encrypted key manifest; no key is bundled in the release JavaScript.

OpenRouter documentation checked on 2026-08-16:

- The Chat Completions endpoint (`/api/v1/chat/completions`) is OpenAI-compatible: request/response shape matches OpenAI's `chat/completions` (`messages[]` in, `choices[0].message.content` out).
- Model ids are namespaced by provider, e.g. `openai/gpt-5-mini`.

## Billing (Constance one-time credits)

- Provider: Constance, TutivSoft's central billing system (`app.tutivsoft.com`).
- Model: one-time credit purchases only. No subscriptions, no license keys (`License_Key_Enabled=No` in the Constance catalog row for `culebra-ai-spell-correct`).
- Credit unit: `characters`. Each operation costs `ceil(input characters / 1000)`, with a minimum of 1 credit.
- Free allowance: 2,000 characters granted once per billing account, server-authoritative through the linked installation's `free_usage` snapshot and `POST /api/v1/billing/free-usage/claim`; `freeCredits` is only a local display mirror.
- Purchased balance: a local mirror (`purchasedCredits`) of the authenticated Constance `CreditBalance`, refreshed through `GET /api/v1/billing/entitlements/me` with the saved bearer session and linked installation id.
- Spending: once the account-scoped free allowance is exhausted, further corrections call authenticated `POST /api/v1/billing/credits/spend`. HTTP 402 blocks the correction with a `Notice`; HTTP 401/403/404 clears the session and requires sign-in. Network failures fail closed so unverified work is never billed or sent to OpenRouter.
- Purchasing: the settings tab has three "Buy" buttons that prefer authenticated `POST /api/v1/billing/checkout` with `plan_code` (`standard`, `pro`, or `ultimate`), the linked installation id, bearer auth, and a stable `Idempotency-Key`. The returned checkout URL is opened in the system browser and settlement is polled through `GET /api/v1/billing/checkouts/{checkout_id}`. Legacy `GET /buy?...` is used only when the authenticated response has no checkout URL.
- Identity: the user signs in or registers with an email and password; if registration requires email verification, the one-time token is entered in the settings tab and sent to `POST /api/v1/auth/register/verify`. Constance then links the persisted random `constanceDeviceId` installation id to the account. The password and verification token are never saved.
- Pricing tiers recorded from the live Constance catalog (last checked 2026-08-16): $1 -> 20,000 characters, $5 -> 160,000 characters, $15 -> 640,000 characters. The current Constance catalog is authoritative. The `Pdl_price_id_OneTime*` values are live Paddle ids.
- Signing/callbacks: this backend-less plugin does not use server-to-server HMAC headers or entitlement callbacks. It uses the current authenticated account endpoints with bearer auth; the legacy unsigned browser-relay routes are not its primary integration.

## Correction Rules

The prompt must instruct the model to:

- Correct spelling, grammar, punctuation, capitalization, repeated spaces, and obvious typing mistakes.
- Preserve the user's meaning, intent, tone, factual claims, and opinions.
- Do not censor, sanitize, moralize, soften, rewrite, summarize, add warnings, or alter controversial/offensive/sensitive wording.
- Respect Indian context because the user is in India.
- Preserve Indian names, place names, organization names, common Indian English wording, Hinglish-style proper nouns, and culturally specific terms unless they are clearly misspelled.
- Correct obvious casing for Indian proper nouns, for example `rahul` to `Rahul` and `bengaluru` to `Bengaluru`.
- Preserve Markdown structure, headings, bullets, tables, links, tags, code blocks, inline code, YAML frontmatter, Obsidian wiki links, embeds, and callouts.
- Preserve normal paragraph breaks.
- Collapse excessive blank lines only when there are more than one blank line between paragraphs.
- Clean repeated spaces where it is safe, but avoid damaging code, tables, URLs, or intentional Markdown spacing.
- Return only the corrected text, with no commentary.

## Safety Rules

- Treat the Obsidian vault as user data.
- Do not bulk-edit notes.
- Modify only the user's current selection, current note, or explicitly right-clicked Markdown file.
- Show a clear notice before and after correction.
- Do not replace content if the API call fails or returns empty text.
- Keep secrets out of git.

## Test Requirements

- Build the plugin successfully with `npm run build`.
- Run `npm run test:vault-plugin` to validate the deterministic release bundle. Set `CULEBRA_VAULT_CONFIG_DIR` only when intentionally checking a specific installed vault.
- Run `node --check publish/main.js` and `git diff --check` before packaging.
- For user-facing verification, use a disposable test vault: correct selected text, undo an editor change, then repeat for a note and a Markdown file, and verify undo and privacy guidance.
- Run the live OpenRouter smoke test only when network access and an intentionally configured test credential are available.
