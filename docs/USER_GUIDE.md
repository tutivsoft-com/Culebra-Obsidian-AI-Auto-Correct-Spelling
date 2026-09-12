# Culebra AI Spell Correct — user guide

## What Culebra does

Culebra corrects spelling, grammar, punctuation, capitalization, and obvious typing mistakes while preserving Markdown structure and meaning.

## First setup

1. Install and enable **Culebra AI Spell Correct** in Obsidian.
2. Open **Settings → Community plugins → Culebra AI Spell Correct**.
3. Read the privacy note, choose an OpenRouter model, and enter your own OpenRouter API key if required by your setup.
4. Start with a short, non-confidential note so you can review the result.

## Correct text

- **Selected text:** highlight a sentence or paragraph, right-click, and choose **Culebra: Correct selected text**.
- **Current note:** place the cursor in a note with no selection, then choose **Culebra: Correct current note**.
- **Markdown file:** right-click a Markdown file in the file explorer and choose **Culebra: Correct this Markdown file**.
- **Command palette:** search for `Culebra: Correct selection or current note`.

Culebra always shows a **Before / After** preview. Choose **Apply correction** to write the change, or **Cancel** to leave the note untouched. Editor changes can also be undone with Ctrl/Cmd+Z.

### Example

Input:

```markdown
Meeting with the client tommorow, dont forget the new proposal.
```

Possible result:

```markdown
Meeting with the client tomorrow; don't forget the new proposal.
```

Review names, dates, links, code, and meaning before applying any AI result.

## Markdown and privacy behavior

Culebra is designed to preserve headings, lists, tables, links, tags, frontmatter, wiki links, embeds, callouts, code, and Indian names or wording. The text you submit is sent to the configured AI provider. Do not submit confidential text unless you accept that remote processing.

## Credits and troubleshooting

AI corrections use character-based credits. The settings page shows the remaining balance and available one-time packs. If a request fails, check the model ID, provider configuration, network connection, and displayed balance. A correction is not applied unless you approve its preview.

## Limitations

AI output can still be wrong. Culebra does not replace careful review, and live Obsidian behavior requires an installed Obsidian desktop or mobile environment.
