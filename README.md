# Culebra AI Spell Correct

Correct spelling, grammar and punctuation in selected text or a Markdown note while retaining its meaning and structure.

Current version: **4.4.62**.

## First use

Enable the plugin and use its settings page. Simple is the default settings mode; Advanced exposes optional configuration. Select text or open a Markdown note, then run Correct selection or current note.

The selected text or note is sent directly to OpenRouter. A changed correction can be applied directly; Review before applying enables a before/after window. Editor changes support the editor's normal Undo. The request queue serializes AI work.

## Account and processing

AI requests go directly to OpenRouter using the fixed request model `~openai/gpt-luna-latest`. The existing managed-key resolver supplies the connection; legacy personal-key/model preferences do not override it. Constance handles account and billing operations.

Culebra meters original input characters using JavaScript UTF-16 string length. A changed correction accepted for application persists its event identity before account usage consumption. Unknown responses retry that same event.

Connect the existing Constance account in settings; registration can require email verification before signing in again. Billing account passwords are sent for authentication and are not persisted. Access/refresh session data and a stable installation identity are saved locally. Account free usage and purchased balance are determined by Constance; cached values and checkout return URLs do not create entitlement. Catalog displays current formatted names, prices, availability and exact price IDs. Unknown usage and checkout results retain their original identities for recovery.

## Diagnostics

Help is available in settings and through Open documentation. Open plugin settings and Copy full debug log are command-palette fallbacks. Debug logging defaults off for a new installation; failures and full Error objects/stacks still appear in the local developer console. Timed information is enabled by the debug preference. The copyable diagnostic buffer keeps at most 1,000 summarized events and excludes raw error text, stacks, note text, paths and credentials. Full console exceptions can contain whatever the failed operation placed in its error. Logs are not uploaded automatically.

## Documentation


License terms are in LICENSE.
