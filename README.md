# Culebra AI Spell Correct

Correct spelling, grammar, punctuation, capitalization, and obvious typing mistakes in Obsidian notes while preserving your meaning and Markdown structure.

Version: `4.4.2` · [Complete user guide](./docs/USER_GUIDE.md)

## Features

- Correct selected text, the current note, or a Markdown file from its context menu.
- Preserve headings, lists, tables, links, tags, code, frontmatter, wiki links, embeds, and callouts.
- Preserve Indian names, places, organizations, Indian English wording, and culturally specific terms.
- Choose the OpenRouter model used for corrections.
- Start with 2,000 free characters per installation.

## Usage

1. Install and enable Culebra AI Spell Correct.
2. Select text in a note, or place the cursor in a note.
3. Open the editor context menu and choose **Culebra: Correct selected text** or **Culebra: Correct current note**. You can also use the command palette and choose **Culebra: Correct selection or current note**.
4. Review the before-and-after preview, then choose **Apply correction**. Cancel leaves your note unchanged; editor changes can be undone with Ctrl/Cmd+Z.
5. Configure the model and review credit information in **Settings > Community plugins > Culebra AI Spell Correct**. The settings page includes a quick-start guide for first use.

When text is selected, only the selection is replaced. With no selection, the current note is replaced. Markdown files can also be corrected from the file explorer context menu.

## Network Use and Privacy

Culebra requires network access to provide AI correction and optional credit management:

- The text being corrected is sent to the OpenRouter chat completions API at `https://openrouter.ai/api/v1/chat/completions`. OpenRouter forwards the request to the model selected in the plugin settings. Do not submit confidential text unless you are comfortable sending it to these services.
- A user-supplied OpenRouter API key in the plugin settings takes precedence and is stored in local plugin data. If the field is blank, Culebra may use its built-in encrypted key fallback. The key is sent only as authorization to OpenRouter.
- The plugin contacts TutivSoft Constance at `https://app.tutivsoft.com` to check and spend purchased correction credits. It sends the plugin ID, a randomly generated installation device ID, and credit transaction data. The device ID is stored in the plugin's local settings.
- Buying credits opens the TutivSoft billing page in the user's browser. A billing email is used for the purchase receipt. Payment is optional; the initial 2,000 local characters can be used without an account or payment.

The plugin does not include client-side telemetry, advertising, self-updating, dependency installation, or access to files outside the current Obsidian vault. It does not collect or transmit note content except when the user explicitly invokes correction.

## Limitations

- An internet connection is required for AI correction and purchased-credit synchronization.
- AI output can be incorrect. Review changes before relying on them.
- The selected model's availability and pricing are controlled by OpenRouter.

## Development

```bash
npm install
npm run build
```

The source entry point is [`main.ts`](./main.ts), and the production bundle is
generated from that source with esbuild. The release assets are `main.js`,
`manifest.json`, and `styles.css`.

To create a production bundle locally:

```bash
npm run build
```

GitHub release assets are attested by the repository's release workflow so their
provenance can be verified independently.

## License

This plugin is licensed under the MIT License. See [`LICENSE`](./LICENSE).
