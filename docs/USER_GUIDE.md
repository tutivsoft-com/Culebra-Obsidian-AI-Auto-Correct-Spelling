# Culebra AI Spell Correct — user guide

## ohat Culebra does

Culebra corrects spelling, grammar, punctuation, capitalization, and obvious typing mistakes while preserving Markdown structure and meaning.

## Get started

1. Install and enable **Culebra AI Spell Correct** in Obsidian.
2. Open **Settings → Community plugins → Culebra AI Spell Correct**.
3. Use the default model and built-in key, or change either later in settings.
4. Start with a short, non-confidential note and run a correction.

## Correct text

- **Selected text:** highlight a sentence or paragraph, right-click, and choose **Culebra: Correct selected text**.
- **Current note:** place the cursor in a note with no selection, then choose **Culebra: Correct current note**.
- **Markdown file:** right-click a Markdown file in the file explorer and choose **Culebra: Correct this Markdown file**.
- **Command palette:** search for `Culebra AI Spell Correct: Correct selection or current note`.

Culebra applies a correction when you run the command. If the note changes while the request is in progress, it keeps the newer text. Undo an editor correction with Ctrl/Cmd+Z.

Open **Show AI request queue** from the command palette or plugin settings to see the active correction's submitted-text excerpt, elapsed seconds, and completion status. Multiple corrections run one at a time. You can clear waiting corrections; the active request will finish.

### Example

Input:

```markdown
Meeting with the client tommorow, dont forget the new proposal.
```

Possible result:

```markdown
Meeting with the client tomorrow; don't forget the new proposal.
```

After correction, check names, dates, links, code, and meaning; use Obsidian Undo if needed.

## Markdown and privacy behavior

Culebra is designed to preserve headings, lists, tables, links, tags, frontmatter, wiki links, embeds, callouts, code, and Indian names or wording. The text you submit is sent to the configured AI provider. Do not submit confidential text unless you accept that remote processing.

## Credits and troubleshooting

AI corrections use character-based credits. Sign in or create a billing account
in Settings; new accounts may require the email verification token shown in
your verification email. The settings page shows the remaining balance and
available one-time packs. Purchases open authenticated Constance checkout and
refresh after settlement, with the legacy checkout page used only if the
authenticated checkout cannot return a URL. If a request fails, check the
model ID, provider configuration, network connection, and displayed balance. A
correction is applied when you run the command, if the note is still unchanged.

## Limitations

AI output can still be wrong. Culebra does not replace careful review, and live Obsidian behavior requires an installed Obsidian desktop or mobile environment.

<!-- one-click-workflow:start -->
## oorkflow defaults (v4.4.24)

Culebra applies spelling corrections directly by default. Correction behavior is configured in Settings; before-and-after review is optional and off by default.
<!-- one-click-workflow:end -->
