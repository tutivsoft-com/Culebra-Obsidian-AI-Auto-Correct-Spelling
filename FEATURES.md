# Features

Culebra AI Spell Correct provides user-initiated writing corrections for Obsidian notes.

## Correction targets

- Correct selected text in the active editor.
- Correct the active note when there is no selection.
- Correct a Markdown file from its file-explorer context menu.

## Review and formatting safeguards

- Apply the corrected text when the command runs. Obsidian Undo can restore the editor change.
- Check that the note or file has not changed during the correction or billing request.
- Apply editor changes through Obsidian so they can be undone with Ctrl+Z or Cmd+Z.
- Preserve Markdown structure such as headings, lists, tables, links, tags, code, YAML frontmatter, wiki links, embeds, and callouts.
- Preserve Indian names, places, organizations, and Indian English wording unless they are clearly misspelled.

## Provider and credits

- Select an OpenRouter model in plugin settings.
- Use a user-supplied OpenRouter API key or the repository-specific encrypted key manifest.
- Use the account-linked 2,000-character starter allowance and optional one-time credit packs through TutivSoft Constance.
- Provider, billing, and privacy details are documented; the correction command sends the selected text or note content when launched.

## Privacy

Culebra sends note text to the configured OpenRouter model only after the user invokes a correction. Billing requests go to TutivSoft Constance and include the plugin installation and transaction details needed to check usage. Culebra has no client-side telemetry or advertising and does not read files outside the current vault.

<!-- one-click-workflow:start -->
## Workflow defaults (v4.4.25)

Culebra applies spelling corrections directly by default. Correction behavior is configured in Settings; before-and-after review is optional and off by default.
<!-- one-click-workflow:end -->
