# Changelog

## 4.4.14 - 2026-09-21

- Incremented release metadata without rebuilding the plugin.

## 4.4.13 - 2026-09-21

- Synchronized billing-authenticated release metadata and the release-bundle smoke test.
- Updated architecture and requirements documentation to describe email/password account linking and authenticated Constance credit spends.

## 4.4.6 - 2026-09-20

- Prepared the next patch version across source, publish, and public metadata.
- No runtime behavior changed in this documentation and version bump.

## 4.4.5 - 2026-09-20

- Published the next synchronized metadata release after 4.4.4.
- Rebuilt and republished the complete source-inclusive public release surface
  so the Obsidian Community entry can resolve the exact `4.4.5` release tag.

## 4.4.4 - 2026-09-12

- Incremented and synchronized the canonical, package, manifest, and publish version surfaces after the billing rollout. No runtime behavior changed in this metadata release.
- Persisted correction credit-spend attempts before remote work and reused the
  same event ID when a response is lost or a request is retried.

## 4.4.2 - 2026-09-11

- Re-published the complete source-inclusive TutivSoft release package so the Obsidian Community source review can inspect the tagged release.
- Added release-history and source-link verification notes to the maintainer workflow.
- Automated Obsidian checks completed; an immediate automated recheck was
  requested and recorded as `open` on 2026-09-11.

## 4.4.1 - 2026-09-11

- Added a first-use correction preview, clearer menu labels, complete user documentation, and inline explanations for the correction flow.
- Synchronized the published source, styles, README, and release metadata.

## 4.4.0 - 2026-08-22

- Bumped the published plugin metadata (`manifest.json`, `package.json`, `package-lock.json`, `VERSION`, `publish/manifest.json`) to `4.4.0`. Culebra now fetches its OpenRouter API key from its own encrypted GitHub manifest (Pattern B) instead of the previous key source; no other application behavior changed.

## 4.3.5 / RA1 2.1.5 - 2026-08-20

- Patched the published plugin metadata (`manifest.json`, `package.json`, `package-lock.json`, `VERSION`, `publish/manifest.json`) to `4.3.5` and aligned the RA1 metadata surface (`rahul_manifest.yaml`, `architecture.md`, `REQUIREMENTS.md`) to `2.1.5`. No functional source changes from `4.3.4`; rebuilt `publish/main.js` and redeployed to the local vault for testing.

## 4.3.4 / RA1 2.1.4 - 2026-08-20

- Patched the published plugin metadata (`manifest.json`, `package.json`, `package-lock.json`, `VERSION`, `publish/manifest.json`) to `4.3.4` and aligned the RA1 metadata surface (`rahul_manifest.yaml`, `architecture.md`, `REQUIREMENTS.md`) to `2.1.4`. No functional source changes from `4.3.3`; the rebuilt `publish/main.js` is byte-equivalent except for the version comment trail.

## 4.3.3 - 2026-08-18

- Prepared the next public release with the complete repository source and release assets.

## 4.3.2 - 2026-08-18

- Incremented the plugin version for the next Obsidian Community release.

## 4.3.1 - 2026-08-18

- Published the source repository layout and release attestation workflow for the Obsidian Community review.

## 4.3.0 - 2026-08-18

- Added a transparent user-supplied OpenRouter API key setting stored in local plugin data.
- Removed the bundled encrypted provider key and obsolete encryption helper so release code is not obfuscated to conceal credentials.
- Added public README disclosures for OpenRouter, TutivSoft Constance billing, payment, local storage, and note-content handling.
- Corrected the command ID to `spell-correct` so it does not repeat the plugin ID.
- Added the MIT license and removed the tracked plaintext credential file.

## 0.2.0 - 2026-08-16

- **Removed bring-your-own-key entirely.** The "OpenAI API key" settings field is gone; `CulebraSettings.apiKey` no longer exists.
- Added a shared, plugin-owned OpenRouter key (Rahul pays OpenRouter directly, same model the sibling Denali plugin uses), AES-256-CBC encrypted with a PBKDF2-derived key baked into `main.ts` and decrypted at runtime via the Web Crypto API. Not real security (a locally-installed plugin's `main.js` is fully readable) -- documented honestly as "raise the bar above trivial extraction."
- Added Constance (TutivSoft, `app.tutivsoft.com`) one-time-credit billing, matching the pattern already shipped for Antero AI Auto Spell Correct: unsigned public browser-relay endpoints (`POST /api/v1/public/browser/entitlements`, `POST /api/v1/public/browser/credits/spend`, `GET /buy`), gated on Constance's catalog flag `App_Allow_Unsigned_Browser_Credit_Spend`.
- Added a random per-install `constanceDeviceId` (`crypto.getRandomValues`, not `Math.random`), persisted in settings, used as both `external_customer_id` and `machine_id` for every Constance call.
- Added local credit state: `freeCredits` (starts at 15, granted once on first install, purely local, never touches Constance) and `purchasedCredits` (local mirror of the real Constance balance, synced from `public/browser/entitlements`).
- Each correction (selection, note, or right-clicked file) now costs 1 credit, spent from the free pool first, then the purchased pool via the Constance spend endpoint. Blocks with a `Notice` and skips the OpenAI call when both pools are confirmed exhausted (402/404 from Constance); fails open (proceeds, reconciles later) on network errors, matching Antero's policy.
- Settings tab: replaced the API key field with a billing email field, three "Buy" buttons ($1/100 corrections, $5/600 corrections, $15/2000 corrections) opening Constance's `GET /buy` checkout, a "Refresh balance" button, and a combined free+purchased credits display.
- Removed the obsolete BYOK vault-key deploy step (`scripts/configure-vault-key.mjs` deleted, `npm run deploy:vault` no longer configures a per-vault API key).
- Rewrote `scripts/test-openai-spell-correct.mjs` (now `scripts/test-openrouter-spell-correct.mjs`) to use a test key supplied through `OPENROUTER_API_KEY`, instead of reading a key from a repository or RA1 file path.
- Rewrote `scripts/test-vault-plugin-install.mjs` to check for the new billing wiring and assert no plaintext OpenAI/OpenRouter key or leftover `apiKey` setting exists in a deployed install, instead of asserting one does.

## 0.1.1 - 2026-05-15

- Metadata release that keeps the plugin version files and release surfaces aligned.

## 0.1.0 - 2026-05-15

- Added the first working Culebra Obsidian plugin release.
- Added `Culebra AI Spell Correct` to editor and Markdown file right-click menus.
- Implemented OpenAI Responses API spell correction using `gpt-5.4-mini`.
- Corrects selected text when present, otherwise the current note or right-clicked Markdown file.
- Added prompt requirements to preserve meaning, Indian proper nouns and wording, Markdown structure, and normal paragraph spacing.
- Added vault deployment, RA1 API key configuration, live API smoke test, and vault install verification scripts.
- Added project requirements and development documentation.
