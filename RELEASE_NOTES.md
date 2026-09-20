# Release Notes

## 4.4.6 - 2026-09-20

Metadata-only patch preparation: synchronized all version surfaces and the
current release documentation. No runtime behavior changed.

## 4.4.5 - 2026-09-20

Metadata-only release: synchronized all version surfaces, rebuilt the bundle,
and published a complete source-inclusive TutivSoft release tagged exactly
`4.4.5` for Obsidian Community detection.

## 4.4.4 - 2026-09-12

Metadata-only release bump: canonical, package, manifest, and publish version surfaces are synchronized. No runtime behavior changed.
## 4.4.13 - 2026-09-21

- Incremented the release version and synchronized the source-inclusive public artifact.
- Verified build, tests, syntax, and release metadata before publication.



## 4.4.2 - 2026-09-11

Maintenance release: includes the complete TypeScript source in the TutivSoft release repository and preserves the verified `main.js`, `manifest.json`, and `styles.css` assets. Obsidian's automated checks completed; an immediate automated recheck request is open as of 2026-09-11.

## 4.4.1 - 2026-09-11

Usability patch: added correction previews, clearer commands, onboarding guidance, complete examples, and synchronized published assets.

## 4.4.0 - 2026-08-22

Bumped the published plugin version to `4.4.0` (`manifest.json`, `package.json`, `package-lock.json`, `VERSION`, `publish/manifest.json`). Culebra now fetches its OpenRouter API key from its own encrypted GitHub manifest (Pattern B) instead of the previous key source.

## 4.3.5 / RA1 2.1.5 - 2026-08-20

Patch release: bumped the published plugin version to `4.3.5` (`manifest.json`, `package.json`, `package-lock.json`, `VERSION`, `publish/manifest.json`) and synchronized the RA1 metadata surface (`rahul_manifest.yaml`, `architecture.md`, `REQUIREMENTS.md`) to `2.1.5`. No application source or feature changes from `4.3.4`; rebuilt and redeployed to the local vault for testing.

## 4.3.4 / RA1 2.1.4 - 2026-08-20

Patch release: bumped the published plugin version to `4.3.4` (`manifest.json`, `package.json`, `package-lock.json`, `VERSION`, `publish/manifest.json`) and synchronized the RA1 metadata surface (`rahul_manifest.yaml`, `architecture.md`, `REQUIREMENTS.md`) to `2.1.4`. No application source or feature changes from `4.3.3`.

## 0.2.0 - 2026-08-16

Shared-key + Constance credit-purchase billing replaces bring-your-own-key.

Culebra used to require every user to paste their own OpenAI API key into
plugin settings. That field is gone. The plugin now ships with a single
 user-supplied OpenRouter API key stored in local plugin data
and decrypted at runtime (structurally the same technique the sibling
Denali plugin uses) -- explicitly not real security, just a step above a
bare string literal, since a locally-installed plugin's `main.js` is fully
readable by the user.

Usage is now paid for with credits instead of a free-forever BYOK model:

- 15 free credits on first install, purely local, no account needed.
- Buy more with real one-time purchases ($1 -> 100 corrections, $5 -> 600
  corrections, $15 -> 2000 corrections) through Constance
  (`app.tutivsoft.com`), TutivSoft's central billing system, via Paddle
  checkout opened from the settings tab.
- Balance is tracked both locally and on Constance's server, synced on
  load and whenever settings are opened; purchases can't be spent from a
  device that never bought them, since spending requires Constance's
  server-side confirmation.
- One credit = one correction operation, independent of text length.

Resolved (2026-08-19): the three Paddle price ids for this app's Constance
catalog row are now real live ids (`App_Environment=live`, `App_Active=Yes`),
replacing the earlier `PENDING_PROVISIONING` placeholders. The Buy buttons
open a real Constance checkout that completes a real payment — verified
end-to-end via `GET /buy` returning a Paddle transaction redirect.

Update (2026-08-19, later): the three Paddle prices were initially
provisioned at 10x the intended amounts ($10/$50/$150 instead of $1/$5/$15).
They were corrected in place to $1/$5/$15 via `PATCH /prices/{id}` on the
Paddle API (same price ids, no plugin/catalog change needed) and re-verified
against the Paddle API.

Verification completed:

- `npx tsc -noEmit -skipLibCheck`
- `npm run build` (esbuild production bundle)
- `node --check main.js` and `node --check` on all modified scripts

Not verified (explicitly out of scope for this pass, same as Antero's
equivalent migration): actually loading the plugin into a running
Obsidian vault and clicking through the settings UI. No tooling was
available in this session to drive an interactive Obsidian instance.

## 0.1.1 - 2026-05-15

Metadata release that keeps the plugin version files and release surfaces aligned.

## 0.1.0 - 2026-05-15

Initial private release of Culebra AI Spell Correct for Rahul's Obsidian vault.

This release provides a working Obsidian plugin that can correct spelling, grammar, punctuation, casing, repeated spaces, and obvious typing mistakes through the OpenAI Responses API with `gpt-5.4-mini`.

Highlights:

- Right-click `Culebra AI Spell Correct` command in Markdown editors.
- Right-click correction for Markdown files in the Obsidian file explorer.
- Selection-first behavior, falling back to the whole current note when nothing is selected.
- Prompt rules to preserve meaning, Indian names and places, Markdown syntax, and normal paragraph breaks.
- Local vault deployment script that keeps the OpenAI API key in the vault plugin settings instead of committing it to git.

Verification completed:

- `npm run build`
- `npm run test:api`
- `npm run test:vault-plugin`
