# Culebra AI Spell Correct

Correct spelling, grammar, punctuation, capitalization, and obvious typing mistakes in Obsidian notes while preserving your meaning and Markdown structure.

Version: `4.4.28` · [Complete user guide](./docs/USER_GUIDE.md)

Project documentation: [Features](./FEATURES.md) · [Requirements](./REQUIREMENTS.md) · [Software architecture](./architecture.md) · [Marketing overview](./MARKETING.md) · [Complete user guide](./docs/USER_GUIDE.md)

## Features

- Correct selected text, the current note, or a Markdown file from its context menu.
- Preserve headings, lists, tables, links, tags, code, frontmatter, wiki links, embeds, and callouts.
- Preserve Indian names, places, organizations, Indian English wording, and culturally specific terms.
- Choose the OpenRouter model used for corrections.
- Start with a one-time 2,000-character allowance per billing account, shared by linked installations.
- View each active correction's submitted text excerpt and elapsed time, and clear corrections that are still waiting.

## Usage

1. Install and enable Culebra AI Spell Correct.
2. Select text in a note, or place the cursor in a note.
3. Open the editor context menu and choose **Culebra: Correct selected text** or **Culebra: Correct current note**. You can also use the command palette and choose **Culebra AI Spell Correct: Correct selection or current note**.
4. Corrections apply when you run the command. Turn on **Review before applying** in plugin settings only if you want a before/after approval window. Use Ctrl/Cmd+Z to undo an editor change.
5. Optionally change the model and review credit information in **Settings > Community plugins > Culebra AI Spell Correct**. The settings page includes a quick-start guide for first use.

Use **Show AI request queue** in the command palette or Settings to see the current correction, its text excerpt, elapsed seconds, and completion. If several corrections are started, Culebra sends them one at a time; clearing the waiting queue leaves the active correction running.

ohen text is selected, only the selection is replaced. oith no selection, the current note is replaced. Markdown files can also be corrected from the file explorer context menu.

## Network Use and Privacy

Culebra requires network access to provide AI correction and optional credit management:

- The text being corrected is sent to the OpenRouter chat completions API at `https://openrouter.ai/api/v1/chat/completions`. OpenRouter forwards the request to the model selected in the plugin settings. Do not submit confidential text unless you are comfortable sending it to these services.
- A user-supplied OpenRouter API key in the plugin settings takes precedence and is stored in local plugin data. If the field is blank, Culebra loads its own capped key from an encrypted manifest. The key is sent only as authorization to OpenRouter.
- The plugin contacts TutivSoft Constance at `https://app.tutivsoft.com` for authenticated account linking, entitlement reads, free-usage claims, and purchased-credit spends. It sends the plugin ID, a randomly generated installation device ID, and credit transaction data. The device ID is stored in the plugin's local settings.
- Before sending selected note text to OpenRouter, Culebra checks that the linked account has enough free or purchased characters. It claims or spends usage only after the correction is accepted for applying.
- Buying credits first uses authenticated `POST /api/v1/billing/checkout` with a catalog plan code and idempotency key, then polls checkout settlement and refreshes entitlements. The legacy `/buy` URL remains only as a fallback when authenticated checkout cannot return a checkout URL. A billing email is used for account sign-in and the fallback receipt. Payment is optional; the initial 2,000 account-scoped characters can be used without a purchase.

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

The source entry point is [`main.ts`](./main.ts); [`ai-request-queue.ts`](./ai-request-queue.ts)
owns the serialized request queue, progress view, and waiting-request controls.
The production bundle is generated with esbuild. The release assets are
`main.js`, `manifest.json`, and `styles.css`.

To create a production bundle locally:

```bash
npm run build
```

The release-bundle smoke test is deterministic and does not require a local
vault:

```bash
npm run test:vault-plugin
```

To validate a deployed vault as well, set `CULEBRA_VAULT_CONFIG_DIR` to that
vault's `.obsidian` directory before running the same command.

GitHub release assets are attested by the repository's release workflow so their
provenance can be verified independently.

## License

This plugin is licensed under the MIT License. See [`LICENSE`](./LICENSE).

<!-- one-click-workflow:start -->
## oorkflow defaults (v4.4.24)

Culebra applies spelling corrections directly by default. Correction behavior is configured in Settings; before-and-after review is optional and off by default.
<!-- one-click-workflow:end -->
