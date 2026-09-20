# Culebra implementation analysis

## Reviewed code map

Reviewed `main.ts`, `constance-account.ts`, `plugin-support.ts`, settings, publish output, and billing integration. The plugin corrects selected or note text through the configured AI provider.

## Changes and safeguards

- Replaced install-local credit assumptions with account-scoped Constance free usage and authenticated entitlement/spend calls.
- Charging uses raw character counts and stable event IDs; failed verification blocks the operation.
- Added account linking/sign-in UI, privacy-safe diagnostics, documentation commands, and silent startup.
- Defaults keep the first correction useful while advanced provider/model settings remain optional.
- Settings and commands put correction actions and account status before advanced tuning.

## Threat model and migration

Bearer sessions are stored only in plugin settings, passwords are not persisted, and the server verifies installation ownership. Reinstalling cannot reset account-scoped free usage. Existing local billing fields are normalized and stale sessions fail closed on authentication errors.

## Documentation and logging

The in-plugin help explains quick start, defaults, account/billing behavior, privacy, troubleshooting, and rollback/undo. `plugin-support.ts` records lifecycle, billing outcomes, correction failures, and uncaught errors without note text, tokens, or credentials.

## Validation

Run `npm run build` and `git diff --check` before publishing. The public mirror must match the private `publish` surface; vault deployment and commits/pushes are intentionally out of scope.

## Remaining limitation

Live Paddle/Constance integration requires the configured service; no production request or vault data was used during local validation.
