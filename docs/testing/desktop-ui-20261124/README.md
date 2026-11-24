# Desktop check for Culebra AI Spell Correct 4.4.102

24 November 2026. Windows, Obsidian 1.15.1. The plugin ran in a separate Obsidian profile with a synthetic Markdown vault. The test used the [published 4.4.102 release](https://github.com/tutivsoft-com/Culebra-Obsidian-AI-Auto-Correct-Spelling/releases/tag/4.4.102).

## Installed files

The downloaded release, the files loaded in the vault, the release tag, and public main before the check contained identical copies of these three assets. The tag points to commit `6eb7391d4678e536baeabef8ca3abdce4ddfa265`.

| File | SHA-256 |
| --- | --- |
| `main.js` | `7891a9c3cd9d3aaae233fe9424f584c0d5de91e1716fc17fecf3423fc0cd19d4` |
| `manifest.json` | `d1d728ebdb113a3cc666946d940f1904f9b6587f0604cfa9fe008383a645fa52` |
| `styles.css` | `18328c45b432b4184998c5ea5144cce5df4314e7f2a039d291fecf05551bee49` |

## Live checks

Signed-out correction left the note intact and reported that it had sent no AI request. The dedicated test account connected through the plugin's settings, showed the live balance, and refreshed it. One live OpenRouter request corrected both lines below. The free allowance fell by 51 characters and the paid balance stayed at its prior value. Native Ctrl+Z restored both original lines and Ctrl+Y reapplied the correction. The live test account was signed out and its session cleared before fixture tests.

| Input | Output |
| --- | --- |
| Ths is a smal note. | This is a small note. |
| We was ready for the spel chek. | We were ready for the spell check. |

## Fixture checks

The tests used the running published bundle and its menus, palette, settings, and dialogs. Deterministic responses supplied AI, account, and billing outcomes. Checkout used a synthetic provider URL and incurred no real payment. The diagnostic log payload was checked for synthetic note text, paths, and credential samples.

| Case | Observed behavior |
| --- | --- |
| Command palette | All nine registered actions were exercised. These cover documentation, diagnostic copy, settings, debug logging, account setup, correction, queue, note results, and stopping remaining note corrections. |
| Simple and Advanced settings | The view switch exposed the extra controls in Advanced. Review, automatic windows, and debug logging saved across view changes. The settings footer displayed `4.4.102`. |
| Help | Both the palette and the settings button opened Help. **Open account** reached account settings and dismissed Help. **Correct selected text** corrected the entire editable note when the selection was empty. The command list has the discrepancy described below. |
| Diagnostics | The log copy worked from settings and the palette. Both copies had the plugin log header and tested version. The debug toggle worked through the palette. |
| Registration and recovery | Registration required verification. A later valid connection linked the fixture account. Recovery and verification requests used their respective purposes. A rejected recovery request lacked feedback. |
| Balance | The refresh action retained the last confirmed balance after a fixture outage and worked again when the service recovered. Two rapid redraws can hide the balance controls. |
| Catalog | USD was available. The invalid offer stayed disabled. When the catalog failed, prices and buy controls were unavailable. Offers returned once the fixture recovered. |
| Checkout | Pending state appeared below the offers. **Check payment** opened the ready provider URL once. **Cancel current purchase** cleared the checkout without granting credits. In a separate fixture case, confirmed fulfillment granted 5,000 fixture characters and cleared the pending state. |
| Editor context menu | Correct selected text changed only the selected span. With no selection, **Correct current note** updated the entire note. |
| Correction outcomes | Unchanged output skipped applying and charging. Blank input skipped AI. Empty, incomplete, refused, and failed provider responses preserved the input. Missing account status or available credits blocked AI. |
| Review | The dialog showed insertions and deletions and navigated changed passages. Cancel and Escape preserved text and used no fixture credits. Apply saved the correction and consumed the fixture allowance. |
| Queue and concurrent edits | The queue showed the active request and one waiting item. Clear removed the waiting item and let the active correction apply. The automatic window opened after opt-in. A changed selection stopped application. Moving only the caret also skipped the whole-note correction. |
| File explorer | The single Markdown file action worked and the non-Markdown file had no correction action. The recursive folder action found four Markdown files. A mixed selection that overlapped a folder and one of its Markdown files processed that file once. The separate selected note was also processed. |
| Batch results | The results view showed applied, unchanged, skipped, and failed notes. **Retry failed notes** corrected only the failed note. The stop command let the active note finish and skipped the three remaining notes. The queue also provided stop and show-results controls. |

## Findings in 4.4.102

- Help lists **Correct selected text**, **Correct current note**, and **Undo last correction** as commands. The palette has a single **Correct selection or current note** command. Undo uses Obsidian's normal editor shortcut.
- When the account recovery endpoint returned a fixture failure, **Send email** stayed usable but showed no error notice. The succeeding request displayed its usual confirmation.
- Two settings redraws in one UI turn removed **Refresh balance** and the credit summary from the visible Account section. A single redraw restored them. The Account row remained visible during the failure.
- Moving the caret without selecting or editing text while a whole-note request was running caused the result to be skipped. The plugin reported a changed note or selection. The note and fixture balance stayed unchanged.

## Screenshots

These ten captures are from the 4.4.102 session. The vault and the fixture prices shown are synthetic.

| Screenshot | What it shows |
| --- | --- |
| [01](screens/01-signed-out-correction.jpg) | The signed-out correction notice and original note. |
| [02](screens/02-simple-settings.jpg) | Simple settings and signed-out account controls. |
| [03](screens/03-live-two-line-correction.jpg) | The actual corrected text and success notice. |
| [04](screens/04-help-and-command-list.jpg) | Help and the published command labels. |
| [05](screens/05-advanced-settings.jpg) | Advanced correction and queue controls. |
| [06](screens/06-fixture-checkout-pending.jpg) | Fixture offers and pending checkout actions. |
| [07](screens/07-review-diff.jpg) | Correction review, highlighted changes, and navigation. |
| [08](screens/08-queue-active-waiting.jpg) | An active correction, a waiting request, and the clear control. |
| [09](screens/09-recursive-folder-menu.jpg) | A recursive action for four Markdown notes. |
| [10](screens/10-batch-results.jpg) | The four batch outcome types and the retry action. |
