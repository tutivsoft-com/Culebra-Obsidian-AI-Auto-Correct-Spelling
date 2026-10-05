# Culebra AI Spell Correct

Correct spelling, grammar, punctuation, capitalization, and obvious typing
mistakes in Obsidian notes while preserving your meaning and Markdown structure.

Version: 4.4.52. Validated for publication; release pending.

Recoverable installation-link failures preserve the verified account session; a rejected installation token clears the saved session and prompts the user to sign in again.

## Features

- Correct selected text, the current note, or a Markdown file from its context menu.
- Preserve headings, lists, tables, links, tags, code, frontmatter, wiki links, embeds, and callouts.
- Preserve Indian names, places, organizations, Indian English wording, and culturally specific terms.
- Corrections use the managed latest-model alias `~openai/gpt-luna-latest`.
- Start with a one-time 2,000-character allowance per billing account, shared by linked installations.
- View active correction progress and copy a complete diagnostic log for debugging.

## Usage

1. Install and enable Culebra AI Spell Correct.
2. Select text in a note, or place the cursor in a note.
3. Use the editor context menu or command palette to run Correct selected text or Correct current note. Markdown files can also be corrected from the file explorer context menu.
4. Corrections apply when you run the command. Turn on Review before applying in plugin settings only if you want a before/after approval window. Use Ctrl/Cmd+Z to undo an editor change.
5. Review credit information in Settings > Community plugins > Culebra AI Spell Correct. Corrections use the managed latest-model alias.

Use Show AI request queue in the command palette or settings to see the current correction, its text excerpt, elapsed time, and completion. Corrections are sent one at a time; clearing the waiting queue leaves the active correction running. With a selection, only that text is replaced. With no selection, the current note is replaced.

## Network use and privacy

Culebra uses network access for AI correction and optional credit management:

- Text you explicitly choose to correct is sent to the OpenRouter chat completions API at https://openrouter.ai/api/v1/chat/completions and forwarded to the managed latest-model alias. Do not submit confidential text unless you are comfortable sending it to these services.
- Culebra uses its managed OpenRouter connection. Personal API keys are not accepted.
- Culebra contacts TutivSoft Constance at https://app.tutivsoft.com for account linking, entitlement reads, free-usage claims, and purchased-credit spends. It sends the plugin ID, a random installation device ID, and credit transaction data.
- Before sending selected note text to OpenRouter, Culebra checks available usage. It claims or spends usage only after the correction is accepted for applying.
- Purchases are optional. The current account balance and available credit offers are shown in plugin settings.

Culebra has no client-side telemetry, advertising, self-updating, dependency installation, or access to files outside the current Obsidian vault. It does not collect or transmit note content except when you explicitly invoke correction.

Diagnostic events remain in memory until the plugin reloads, up to 1,000 events. They exclude note contents, file paths, credentials, and raw error messages, and are not transmitted automatically. A copied log contains the plugin ID and version, timestamps, safe diagnostic events, and your browser user agent.

## Limitations

- An internet connection is required for AI correction and purchased-credit synchronization.
- AI output can be incorrect. Review changes before relying on them.
- Model availability and pricing are controlled by OpenRouter.

## License

This plugin is licensed under the MIT License. See LICENSE.

## Account, billing, and credit feedback

Account and billing controls appear at the top of settings. Register with an email and password, confirm the link sent by email, then return and sign in. The settings page shows the current balance and provides balance refresh, sign-out, and purchase controls. Metered actions show the available balance and report the amount used with the remaining balance when the action completes.

Current version: 4.4.52


### Getting started with your account

Select text or open a Markdown note, then run a Culebra correction command. You can undo the changes. Create an account or sign in in the plugin settings, verify your email if requested, then connect. Free AI usage requires a registered, connected account to help prevent abuse. The default lifetime allowance is 2,000 AI characters per account as our thank-you for trying the app; settings check the current policy and account balance. You can add credits at affordable prices once you are ready; the current offers and prices load in settings. Setup guidance stays visible until connected, and the welcome appears only once.

## Account lifetime allowance

2,000 characters lifetime per account. Characters in the successfully accepted correction. Existing allowance consumption survives upgrades and reinstalls; lifetime allowances do not refill daily. Free units are used first and purchased units cover the remainder of the same operation. Native writes retain reserve, write, verify and finalize safeguards. Uncertain results retain the original event for recovery. The app retains its existing review and result-authorization workflow.

The allowance belongs to the account and does not reset daily or after reinstalling. Free units are consumed first; purchased units cover the remainder. Current prices and available offers load from Constance in settings.
