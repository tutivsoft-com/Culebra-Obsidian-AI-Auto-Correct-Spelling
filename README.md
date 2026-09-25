# Culebra AI Spell Correct

Correct spelling, grammar, punctuation, capitalization, and obvious typing
mistakes in Obsidian notes while preserving your meaning and Markdown structure.

Version: 4.4.31

## Features

- Correct selected text, the current note, or a Markdown file from its context menu.
- Preserve headings, lists, tables, links, tags, code, frontmatter, wiki links, embeds, and callouts.
- Preserve Indian names, places, organizations, Indian English wording, and culturally specific terms.
- Choose the OpenRouter model used for corrections.
- Start with a one-time 2,000-character allowance per billing account, shared by linked installations.
- View active correction progress and copy a complete diagnostic log for debugging.

## Usage

1. Install and enable Culebra AI Spell Correct.
2. Select text in a note, or place the cursor in a note.
3. Use the editor context menu or command palette to run Correct selected text or Correct current note. Markdown files can also be corrected from the file explorer context menu.
4. Corrections apply when you run the command. Turn on Review before applying in plugin settings only if you want a before/after approval window. Use Ctrl/Cmd+Z to undo an editor change.
5. Optionally change the model and review credit information in Settings > Community plugins > Culebra AI Spell Correct.

Use Show AI request queue in the command palette or settings to see the current correction, its text excerpt, elapsed time, and completion. Corrections are sent one at a time; clearing the waiting queue leaves the active correction running. With a selection, only that text is replaced. With no selection, the current note is replaced.

## Network use and privacy

Culebra uses network access for AI correction and optional credit management:

- Text you explicitly choose to correct is sent to the OpenRouter chat completions API at https://openrouter.ai/api/v1/chat/completions and forwarded to the model selected in plugin settings. Do not submit confidential text unless you are comfortable sending it to these services.
- Your OpenRouter API key takes precedence and is stored in local plugin data. When no personal key is set, Culebra uses its capped built-in key. The key is sent only to OpenRouter for authorization.
- Culebra contacts TutivSoft Constance at https://app.tutivsoft.com for account linking, entitlement reads, free-usage claims, and purchased-credit spends. It sends the plugin ID, a random installation device ID, and credit transaction data.
- Before sending selected note text to OpenRouter, Culebra checks available usage. It claims or spends usage only after the correction is accepted for applying.
- Purchases are optional. The initial 2,000 account-scoped characters can be used without a purchase.

Culebra has no client-side telemetry, advertising, self-updating, dependency installation, or access to files outside the current Obsidian vault. It does not collect or transmit note content except when you explicitly invoke correction.

Diagnostic events remain in memory until the plugin reloads, up to 1,000 events. They exclude note contents, file paths, credentials, and raw error messages, and are not transmitted automatically. A copied log contains the plugin ID and version, timestamps, safe diagnostic events, and your browser user agent.

## Limitations

- An internet connection is required for AI correction and purchased-credit synchronization.
- AI output can be incorrect. Review changes before relying on them.
- Model availability and pricing are controlled by OpenRouter.

## License

This plugin is licensed under the MIT License. See LICENSE.
