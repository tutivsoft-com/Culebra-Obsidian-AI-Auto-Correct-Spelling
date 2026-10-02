## Current purchase behavior

Purchase settings load the app's current offer configuration and Paddle prices from Constance. Offer quantities use the app's native billing unit from that configuration; displayed amounts and descriptions come from the current provider price. The client matches offers by exact configured price ID and enables purchase only when Constance reports `checkout_available`. Checkout sends that exact price ID through the authenticated billing route. Prices and pack quantities are not fixed in the plugin. Existing account balances and granted credits remain associated with the account.

<!-- SETTINGS-CURRENT-2026-09-30 -->
## Current local settings implementation

The local working tree uses persisted **Simple** and **Advanced** modes; new installs default to Simple. Simple shows everyday workflow and account/billing controls; Advanced adds customization and diagnostics. Review-before-apply remains off by default in current source; explicit saved preferences remain in effect.

AI corrections run directly through OpenRouter using Culebra's existing managed Pattern B key manifest and the configured model. Constance handles account billing only.

The plugin checks Constance account entitlements before sending a correction, then charges the same character amount only after a valid result is accepted for application. Current Paddle prices and descriptions are loaded from Constance's billing catalog by exact configured price ID.

This describes local source changes, not a published release or verified live deployment.
Simple: review preference, account, balance and purchases. Advanced: model choice, request queue and diagnostics.

<!-- SETTINGS-CURRENT-2026-09-30:END -->

<!-- BILLING-CURRENT-2026-09-30 -->
## Current local account and billing behavior

Use **Connect** with your email and password. A new account is registered; an existing account is authenticated. New users must follow the emailed verification link and Connect again. Incorrect passwords offer password recovery; passwords are never saved. Paid purchases and free allowances belong to the authenticated account, not a locally entered email or an editable cached balance. Reinstalling does not replenish the same account's allowance.

Constance is the billing authority. Credit units remain app-specific: characters, OCR pages, searches, conversions, repair/protection batches, or captures. Checkout return URLs and cached balances never grant credits. Payment fulfillment comes from the server’s verified Paddle webhook, and balances refresh from authenticated entitlements. Unknown usage or checkout results reuse the persisted operation ID; they must not create a new debit or alternative checkout.


See [local billing changes](BILLING_REVIEW_2026-09-30.md). This section describes the current local source; older release walkthroughs below apply to their dated artifacts. Constance must support `/api/v1/auth/connect` before these clients are released.
<!-- BILLING-CURRENT-2026-09-30:END -->

# Culebra AI Spell Correct

Correct spelling, grammar, punctuation, capitalization, and obvious typing
mistakes in Obsidian notes while preserving your meaning and Markdown structure.

Local source version: 4.4.45

## Features

- Correct selected text, the current note, or a Markdown file from its context menu.
- Preserve headings, lists, tables, links, tags, code, frontmatter, wiki links, embeds, and callouts.
- Preserve Indian names, places, organizations, Indian English wording, and culturally specific terms.
- Corrections go directly to OpenRouter using the app's existing managed Pattern B key manifest and the model selected in Advanced settings.
- Constance is used for account linking, character allowances, credit spends, and Paddle checkout.
- View active correction progress and copy a complete diagnostic log for debugging.

## Usage

1. Install and enable Culebra AI Spell Correct.
2. Select text in a note, or place the cursor in a note.
3. Use the editor context menu or command palette to run Correct selected text or Correct current note. Markdown files can also be corrected from the file explorer context menu.
4. Corrections apply when you run the command. Turn on Review before applying in plugin settings only if you want a before/after approval window. Use Ctrl/Cmd+Z to undo an editor change.
5. Connect your billing account in Settings > Community plugins > Culebra AI Spell Correct. Advanced settings show the current model.

Use Show AI request queue in the command palette or settings to see the current correction, its text excerpt, elapsed time, and completion. Corrections are sent one at a time; clearing the waiting queue leaves the active correction running. With a selection, only that text is replaced. With no selection, the current note is replaced.

## Network use and privacy

Culebra uses network access for AI correction and optional credit management:

- Text you explicitly choose to correct is sent directly to OpenRouter using Culebra's existing managed key connection. Do not submit confidential text unless you accept remote processing.
- Culebra contacts TutivSoft Constance at https://app.tutivsoft.com for account linking, entitlement reads, free-usage claims, and purchased-credit spends. It sends the plugin ID, a random installation device ID, and credit transaction data.
- Before sending selected note text to OpenRouter, Culebra checks available usage. It claims or spends usage only after the correction is accepted for applying.
- Purchase availability and displayed price and description come from the current Constance catalog, which maps this app's configured offers to Paddle price IDs.

Culebra has no client-side telemetry, advertising, self-updating, dependency installation, or access to files outside the current Obsidian vault. It does not collect or transmit note content except when you explicitly invoke correction.

Diagnostic events remain in memory until the plugin reloads, up to 1,000 events. They exclude note contents, file paths, credentials, and raw error messages, and are not transmitted automatically. A copied log contains the plugin ID and version, timestamps, safe diagnostic events, and your browser user agent.

## Limitations

- An internet connection is required for AI correction and purchased-credit synchronization.
- AI output can be incorrect. Review changes before relying on them.
- OpenRouter availability and the selected model can affect corrections. Constance handles account billing and credit authorization.

## License

This plugin is licensed under the MIT License. See LICENSE.

## Account, billing, and credit feedback

Account and billing controls appear at the top of settings. Select Connect with your email and password; verify the emailed link if requested, then Connect again. The settings page shows the current balance and provides balance refresh, sign-out, and purchase controls. Metered actions show the available balance and report the amount used with the remaining balance when the action completes.
The plugin rotates and saves Constance refresh tokens so billing sessions continue after access-token expiry. Sign out revokes the refresh session. Use **Forgot password?** in settings to open the central recovery page.

Current local source version: 4.4.45.



AI corrections run directly through OpenRouter with Culebra's existing managed key manifest. Constance provides account-linked character allowances, credit accounting, current Paddle offers, and checkout. A correction is charged only after a non-empty result is accepted for application; uncertain billing requests retain and retry the same operation ID.

<!-- RA1-CODEBASE-SNAPSHOT:START -->
## Local Codebase Snapshot

Updated: `2026-10-02`

Source scanned from: `C:\Users\Rahul\Desktop\ghrepos\tool-app-Culebra-Obsidian-AI-Auto-Correct-Spelling`
Category: `Local repositories`
Current branch: `main`

### Detected Stack

- `TypeScript` (12)
- `JavaScript` (12)
- `CSS` (2)
- `Shell` (1)

### Source Map

- Code files scanned: `27`
- Markdown/docs files scanned: `41`
- Manifest/deploy files scanned: `2`
- Main source areas: `/` (31), `publish/` (21), `tests/` (8), `docs/` (8), `scripts/` (2)

### Main Entry Points

- `main.ts`
- `publish\main.js`
- `publish\main.ts`

### Manifests And Deploy Files

- `package.json`
- `tsconfig.json`

### Documentation Files

- `AGENTS.md`
- `ai_model.md`
- `ai_model_change_20260910224059.md`
- `architecture.md`
- `BILLING_REVIEW_2026-09-30.md`
- `CHANGE_IN_MODEL_20260817102257.md`
- `CHANGELOG.md`
- `chatgpt_sol_analysis_20260920141546.md`
- `CONTRIBUTORS.md`
- `docs\END_TO_END_OBSIDIAN_RELEASE_WORKFLOW.md`
- `docs\OBSIDIAN_RELEASE_RUNBOOK.md`
- `docs\release-evidence\obsidian-community-4.4.37.md`
- `docs\RELEASE_STATUS_2026-09-12.md`
- `docs\RELEASE_STATUS_2026-09-25-4.4.31.md`
- `docs\RELEASE_STATUS_2026-09-25.md`
- `docs\RELEASE_STATUS_2026-09-26-4.4.33.md`
- `docs\USER_GUIDE.md`
- `FEATURES.md`
- ... 23 more

### Detected Routes Or App Handlers

- No framework route declarations detected by the scanner.

### Detected Package Commands

- `npm run build`
- `npm run deploy:vault`
- `npm run dev`
- `npm run test`
- `npm run test:api`
- `npm run test:vault-plugin`

### Maintenance Rule

When source files, routes, user flows, manifests, Docker/compose settings, or deployment behavior change, refresh this managed block with:

```bash
python "C:/Users/Rahul/Desktop/ghrepos/RA1/MAIN/40 Common/Scripts/refresh_local_repo_docs.py" --repo "tool-app-Culebra-Obsidian-AI-Auto-Correct-Spelling"
```
<!-- RA1-CODEBASE-SNAPSHOT:END -->
