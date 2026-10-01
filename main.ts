import { configureGateway, gatewayFor, managedText, addLivePacks, codePoints } from "./preview-gateway";
import { resumeAccountCheckout } from "./billing-checkout";
import { refreshBillingSession } from "./constance-account";
import {
  Editor,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
  TFile,
} from "obsidian";
import { addBillingAccountSettings, claimAccountFreeUsage, clearBillingSession, createAuthenticatedCheckout, pollAuthenticatedCheckout, requestAuthenticatedBilling, spendAccountCredits } from "./constance-account";
import { PluginSupport } from "./plugin-support";
import { AiRequestQueue } from "./ai-request-queue";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "~deepseek/deepseek-v4-flash-latest";

const SPELL_CORRECT_INSTRUCTIONS = `You are Culebra AI Spell Correct, a careful copy editor for an Obsidian Markdown vault.

Task:
Correct only spelling, grammar, punctuation, capitalization, repeated spaces, and obvious typing mistakes.

Hard rules:
- Preserve the user's meaning, intent, factual claims, opinions, tone, and emotional force.
- Do not censor, sanitize, moralize, soften, rewrite, summarize, add warnings, or alter controversial/offensive/sensitive wording.
- The user is in India. Preserve Indian names, place names, organization names, common Indian English wording, Hinglish-style proper nouns, and culturally specific terms unless they are clearly misspelled.
- When an Indian personal name, city, state, company, or other proper noun is clearly present with wrong casing, correct the capitalization, for example rahul to Rahul and bengaluru to Bengaluru.
- Preserve Markdown structure, headings, bullets, numbered lists, tables, links, tags, code blocks, inline code, YAML frontmatter, Obsidian wiki links, embeds, and callouts.
- Preserve normal paragraph breaks.
- If there are more than one blank line between paragraphs, collapse them to one blank line.
- Clean repeated spaces where safe, but do not damage code, tables, URLs, or intentional Markdown spacing.
- Return only the corrected text. Do not wrap it in code fences. Do not add commentary.`;

// --- Constance (TutivSoft) billing integration ---
// One-time credit purchases only, no license keys. Authenticated Constance
// account endpoints are used for balance reads, free-usage claims, and spends.
// Purchases use configured price IDs from Constance's live catalog.
const CONSTANCE_BASE_URL = "https://app.tutivsoft.com";
const CONSTANCE_APP_ID = "culebra-ai-spell-correct";

function generateSecureDeviceId(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateEventId(): string {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return "evt_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchConstanceEntitlements(plugin: CulebraSpellCorrectPlugin): Promise<any> {
  if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) return null;
  const query = new URLSearchParams({ app_id: CONSTANCE_APP_ID, installation_id: plugin.settings.constanceDeviceId });
  const response = await requestAuthenticatedBilling(plugin.settings, () => plugin.saveSettings(), {
    url: `${CONSTANCE_BASE_URL}/api/v1/billing/entitlements/me?${query.toString()}`,
    method: "GET",
    throw: false,
  });
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    clearBillingSession(plugin.settings);
    await plugin.saveSettings();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Entitlement sync failed: HTTP ${response.status}`);
  }
  return response.json?.data;
}

type SpendResult =
  | { kind: "ok"; balance: number }
  | { kind: "insufficient" }
  | { kind: "error" };

async function spendConstanceCredits(plugin: CulebraSpellCorrectPlugin, amount: number, stableEventId: string): Promise<SpendResult> {
  const result = await spendAccountCredits(plugin.settings, () => plugin.saveSettings(), CONSTANCE_APP_ID, plugin.settings.constanceDeviceId, stableEventId, amount);
  if (result.kind === "ok" || result.kind === "insufficient" || result.kind === "error") return result;
  clearBillingSession(plugin.settings);
  await plugin.saveSettings();
  return { kind: "error" };
}

async function syncPurchasedCreditsFromConstance(plugin: CulebraSpellCorrectPlugin, manual = false): Promise<void> {
  resumeAccountCheckout({ state: plugin.settings, appId: CONSTANCE_APP_ID, installationId: plugin.settings.constanceDeviceId,
    persist: () => plugin.saveSettings(), syncBalance: () => syncPurchasedCreditsFromConstance(plugin), refreshSession: () => refreshBillingSession(plugin.settings, () => plugin.saveSettings()) });

  if (!plugin.settings.constanceDeviceId) {
    return;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin);
    const serverBalance = entitlement?.credits?.balance;
    if (!Number.isFinite(serverBalance)) throw new Error("Billing returned an invalid balance");
    plugin.settings.freeCredits = Math.max(0, Number(entitlement?.free_usage?.remaining) || 0);
    plugin.settings.purchasedCredits = Math.max(0, Number(serverBalance) || 0);
    await plugin.saveSettings();
  } catch (error) {
    if (manual) throw error;
    console.error("Culebra: Constance entitlement sync failed", error);
  }
}

async function retryPendingSpendEvents(plugin: CulebraSpellCorrectPlugin): Promise<void> {
  const pending = [...(plugin.settings.pendingSpendEvents ?? [])];
  for (const event of pending) {
    if (event.kind === "free") {
      const result = await claimAccountFreeUsage(plugin.settings, () => plugin.saveSettings(), CONSTANCE_APP_ID, plugin.settings.constanceDeviceId, event.eventId, event.amount);
      if (result.kind === "error" || result.kind === "auth-required") break;
      plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter((item) => item.eventId !== event.eventId);
      if (result.kind === "ok") plugin.settings.freeCredits = result.remaining;
      await plugin.saveSettings();
      continue;
    }
    const result = await spendConstanceCredits(plugin, event.amount, event.eventId);
    if (result.kind === "error") break;
    plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter((item) => item.eventId !== event.eventId);
    if (result.kind === "ok") plugin.settings.purchasedCredits = result.balance;
    else plugin.settings.purchasedCredits = 0;
    await plugin.saveSettings();
  }
}

async function checkBillingBeforeAi(plugin: CulebraSpellCorrectPlugin, amount: number): Promise<boolean> {
  if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) {
    new Notice("Culebra: sign in or create a billing account in plugin settings before sending text to AI.");
    return false;
  }
  await retryPendingSpendEvents(plugin);
  if (plugin.settings.pendingSpendEvents.length > 0) {
    new Notice("Culebra: a previous credit spend is still being reconciled. No AI request was sent.");
    return false;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin);
    const freeRemaining = Math.max(0, Number(entitlement?.free_usage?.remaining) || 0);
    const paidBalance = Math.max(0, Number(entitlement?.credits?.balance) || 0);
    plugin.settings.freeCredits = freeRemaining;
    plugin.settings.purchasedCredits = paidBalance;
    await plugin.saveSettings();
    if (freeRemaining >= amount || paidBalance >= amount) return true;
    new Notice("Culebra: not enough free or purchased characters. No AI request was sent.");
    return false;
  } catch {
    if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) {
      new Notice("Culebra: your billing session expired. Sign in again before using AI.");
    } else {
      new Notice("Culebra: billing could not be verified. No AI request was sent.");
    }
    return false;
  }
}

interface CulebraSettings {
  settingsMode: "simple" | "advanced";
  model: string;
  apiKey: string;
  constanceDeviceId: string;
  billingEmail: string;
  billingAccessToken: string;
  billingRefreshToken: string;
  billingAccessExpiresAt: number;
  billingAccountLinked: boolean;
  // Local mirror of the account-scoped free allowance returned by Constance.
  // It is never authoritative and starts at zero so reinstalling cannot
  // appear to grant a new local allowance.
  freeCredits: number;
  // Local mirror of the real Constance CreditBalance, refreshed through the
  // authenticated account entitlement endpoint.
  purchasedCredits: number;
  // Free and paid events are written before their billing request. Unknown transport
  // outcomes stay here and are retried with the same event ID after restart.
  pendingSpendEvents: Array<{ eventId: string; amount: number; kind?: "free" | "paid" }>;
  onboardingSeen: boolean;
  reviewBeforeApply: boolean;
}

const DEFAULT_SETTINGS: CulebraSettings = {
  settingsMode: "simple",
  model: DEFAULT_MODEL,
  apiKey: "",
  constanceDeviceId: "",
  billingEmail: "",
  billingAccessToken: "",
  billingRefreshToken: "",
  billingAccessExpiresAt: 0,
  billingAccountLinked: false,
  freeCredits: 0,
  purchasedCredits: 0,
  pendingSpendEvents: [],
  onboardingSeen: false,
  reviewBeforeApply: false,
};

/**
 * Coordinates Culebra's one-command correction flow. Optional review is
 * available from settings and is off by default.
 */
export default class CulebraSpellCorrectPlugin extends Plugin {
  support!: PluginSupport;
  settings: CulebraSettings = DEFAULT_SETTINGS;
  aiQueue!: AiRequestQueue;
  async onload() {
    this.support = new PluginSupport(this, { name: "Culebra AI Spell Correct", summary: "Correct selected text or an entire note with a one-action AI workflow.", quickStart: ["Sign in to billing in Settings.", "Select text or open a Markdown note.", "Run a Culebra correction command; edits apply automatically and can be undone."], commands: ["Correct selected text", "Correct current note", "Undo last correction"], troubleshooting: ["Use Copy debug log before reporting a problem.", "Confirm the note is editable and the billing account is linked."] });
    this.support.start();
    await this.loadSettings();
    this.aiQueue = new AiRequestQueue(this.app, "Culebra");

    if (!this.settings.constanceDeviceId) {
      this.settings.constanceDeviceId = generateSecureDeviceId();
      await this.saveSettings();
    }
    this.settings.pendingSpendEvents = Array.isArray(this.settings.pendingSpendEvents)
      ? this.settings.pendingSpendEvents.filter((item) => item && typeof item.eventId === "string" && Number.isInteger(item.amount) && item.amount > 0)
      : [];
    this.settings.billingAccessToken = typeof this.settings.billingAccessToken === "string" ? this.settings.billingAccessToken : "";
    this.settings.billingRefreshToken = typeof this.settings.billingRefreshToken === "string" ? this.settings.billingRefreshToken : "";
    this.settings.billingAccessExpiresAt = Number(this.settings.billingAccessExpiresAt) || 0;
    this.settings.billingAccountLinked = this.settings.billingAccountLinked === true && Boolean(this.settings.billingAccessToken);
    await this.saveSettings();

    if (!this.settings.onboardingSeen) {
      this.settings.onboardingSeen = true;
      await this.saveSettings();
    }

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor: Editor) => {
        const hasSelection = editor.getSelection().trim().length > 0;
        menu.addItem((item) => {
          item
            .setTitle(hasSelection ? "Culebra: Correct selected text" : "Culebra: Correct current note")
            .setIcon("spell-check")
            .onClick(() => {
              void this.correctEditorText(editor);
            });
        });
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        menu.addItem((item) => {
          item
            .setTitle("Culebra: Correct this Markdown file")
            .setIcon("spell-check")
            .onClick(() => {
              void this.correctFile(file);
            });
        });
      }),
    );

    this.addCommand({
      id: "spell-correct",
      name: "Correct selection or current note",
      editorCallback: (editor) => this.correctEditorText(editor),
    });
    this.addCommand({ id: "show-ai-request-queue", name: "Show AI request queue", callback: () => this.aiQueue.open() });

    configureGateway(this.settings, { app:this.app, appId:CONSTANCE_APP_ID, installationId:this.settings.constanceDeviceId, state:this.settings, persist:()=>this.saveSettings() });
    this.addSettingTab(new CulebraSettingTab(this.app, this));
    // Background balance sync; never blocks load, fails silently offline.
    void syncPurchasedCreditsFromConstance(this).then(() => retryPendingSpendEvents(this));
  }

  async loadSettings() {
    const savedSettings = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
    this.settings.settingsMode = this.settings.settingsMode === "advanced" ? "advanced" : "simple";
    // Free usage is account-scoped; never trust a legacy local counter.
    this.settings.freeCredits = 0;
    // Existing installs predate the onboarding flag; do not show a first-run
    // notice to them after upgrading.
    if (savedSettings && typeof savedSettings.onboardingSeen !== "boolean") {
      this.settings.onboardingSeen = true;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private pollAfterCheckout(checkoutId?: string) {
    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      void (async () => {
        const settled = checkoutId
          ? await pollAuthenticatedCheckout({ state: this.settings, appId: CONSTANCE_APP_ID, installationId: this.settings.constanceDeviceId, persist: () => this.saveSettings(), syncBalance: () => syncPurchasedCreditsFromConstance(this) }, checkoutId).catch(() => false)
          : false;
        if (settled || !checkoutId) await syncPurchasedCreditsFromConstance(this);
        if (settled || attempts >= 6) window.clearInterval(intervalId);
      })();
    }, 15000);
  }

   /**
   * Reserves the character-based cost only after the user approves a preview.
   * The local free-character pool is used first, followed by the Constance
    * balance; any unverified balance or spend blocks the edit until the
    * server gives an authoritative result.
    */
  private async chargeOneCredit(textLength: number): Promise<boolean> {
    const cost = Math.max(1, Math.ceil(textLength));
    if (!this.settings.billingAccessToken || !this.settings.billingAccountLinked) {
      new Notice("Culebra: sign in or create a billing account in plugin settings before correcting text.");
      return false;
    }
    await retryPendingSpendEvents(this);
    if (this.settings.pendingSpendEvents.length > 0) {
      new Notice("Culebra: a previous billing operation is still being reconciled. No correction was applied.");
      return false;
    }
    const freeEventId = `free_${generateEventId()}`;
    this.settings.pendingSpendEvents.push({ eventId: freeEventId, amount: cost, kind: "free" });
    await this.saveSettings();
    const free = await claimAccountFreeUsage(this.settings, () => this.saveSettings(), CONSTANCE_APP_ID, this.settings.constanceDeviceId, freeEventId, cost);
    if (free.kind === "ok" || free.kind === "insufficient") {
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== freeEventId);
      await this.saveSettings();
    }
    if (free.kind === "ok") {
      this.settings.freeCredits = free.remaining;
      await this.saveSettings();
      return true;
    }
    if (free.kind === "auth-required") { clearBillingSession(this.settings); await this.saveSettings(); new Notice("Culebra: your billing session expired. Sign in again."); return false; }
    if (free.kind === "error") { new Notice("Culebra: the account allowance could not be verified. No correction was applied."); return false; }

    await retryPendingSpendEvents(this);
    if (this.settings.pendingSpendEvents.length > 0) {
      new Notice("Culebra: a previous credit spend is still being reconciled. Please retry after the connection is restored.");
      return false;
    }
    const stableEventId = generateEventId();
    this.settings.pendingSpendEvents.push({ eventId: stableEventId, amount: cost });
    try {
      await this.saveSettings();
    } catch (error) {
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      console.error("Culebra: could not persist pending credit spend", error);
      return false;
    }
    const result = await spendConstanceCredits(this, cost, stableEventId);
    if (result.kind === "ok") {
      this.settings.purchasedCredits = result.balance;
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      await this.saveSettings();
      return true;
    }
    if (result.kind === "insufficient") {
      this.settings.purchasedCredits = 0;
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      await this.saveSettings();
      new Notice("Culebra: out of characters. Review current one-time offers in plugin settings.");
      return false;
    }

    console.warn("Culebra: credit spend is unknown; blocking until the persisted event can be reconciled.");
    new Notice("Culebra: billing could not be verified. Retry after the connection is restored.");
    return false;
  }

   /** Correct the current selection, or the whole active note when no text is selected. */
   private async correctEditorText(editor: Editor) {
    const selection = editor.getSelection();
    const hasSelection = selection.trim().length > 0;
    const originalText = hasSelection ? selection : editor.getValue();
    const target = hasSelection ? "selection" : "current note";

    const correctedText = await this.correctText(originalText, target);
    if (!correctedText) {
      return;
    }

    if (correctedText === originalText) {
      new Notice(`Culebra found no changes in the ${target}.`);
      return;
    }

    if (this.settings.reviewBeforeApply && !(await new CorrectionReviewModal(this.app, target, originalText, correctedText).waitForResult())) return;
    if (hasSelection ? editor.getSelection() !== originalText : editor.getValue() !== originalText) {
      new Notice("Culebra: the note changed during correction. Run the correction again to protect your edits.");
      return;
    }
    // Full reveal already committed this immutable operation; apply is free.
    if (hasSelection ? editor.getSelection() !== originalText : editor.getValue() !== originalText) {
      new Notice("Culebra: the note changed during billing. Your edits were protected; contact support for a credit adjustment.");
      return;
    }

    if (hasSelection) {
      editor.replaceSelection(correctedText);
    } else {
      editor.setValue(correctedText);
    }

    new Notice(`Culebra corrected ${target}. Undo with Ctrl/Cmd+Z if needed.`);
  }

   /** Replace a Markdown file after optional Settings-based before/after review. */
   private async correctFile(file: TFile) {
    const originalText = await this.app.vault.read(file);
    const correctedText = await this.correctText(originalText, file.name);

    if (!correctedText) {
      return;
    }

    if (correctedText === originalText) {
      new Notice(`Culebra found no changes in ${file.name}.`);
      return;
    }

    if (await this.app.vault.read(file) !== originalText) {
      new Notice(`Culebra: ${file.name} changed during correction. Run the correction again to protect your edits.`);
      return;
    }
    if (this.settings.reviewBeforeApply && !(await new CorrectionReviewModal(this.app, file.name, originalText, correctedText).waitForResult())) return;
    // Full reveal already committed this immutable operation; apply is free.
    if (await this.app.vault.read(file) !== originalText) {
      new Notice(`Culebra: ${file.name} changed during billing. Your edits were protected; contact support for a credit adjustment.`);
      return;
    }

    await this.app.vault.modify(file, correctedText);
    new Notice(`Culebra corrected ${file.name}.`);
  }

   /** Ask the configured provider for corrected text without mutating the vault. */
   private async correctText(originalText: string, targetLabel: string) {
    if (!originalText.trim()) return null;
    const queued = await this.aiQueue.enqueue(`Correction for ${targetLabel}`, originalText, async () => {
      try { return await managedText(gatewayFor(this.settings), originalText, "correct", {input_characters:codePoints(originalText)}); }
      catch(error) { new Notice(error instanceof Error ? error.message : "Preview unavailable."); return null; }
    });
    return queued.status === "completed" ? queued.value : null;
  }

}

class CorrectionReviewModal extends Modal {
  private resolveResult!: (approved: boolean) => void;
  private settled = false;
  constructor(app: CulebraSpellCorrectPlugin["app"], private target: string, private before: string, private after: string) { super(app); }
  waitForResult(): Promise<boolean> { this.open(); return new Promise((resolve) => { this.resolveResult = resolve; }); }
  onOpen() {
    this.contentEl.createEl("h2", { text: `Review correction: ${this.target}` });
    const diff = this.contentEl.createEl("pre", { text: `BEFORE\n${this.before}\n\nAFTER\n${this.after}` });
    diff.style.whiteSpace = "pre-wrap";
    diff.style.maxHeight = "55vh";
    diff.style.overflow = "auto";
    const actions = this.contentEl.createDiv();
    actions.createEl("button", { text: "Cancel" }).onclick = () => this.finish(false);
    actions.createEl("button", { text: "Apply correction", cls: "mod-cta" }).onclick = () => this.finish(true);
  }
  private finish(approved: boolean) { if (this.settled) return; this.settled = true; this.resolveResult(approved); this.close(); }
  onClose() { if (!this.settled) { this.settled = true; this.resolveResult(false); } this.contentEl.empty(); }
}

function extractResponseText(responseJson: unknown): string {
  if (!responseJson || typeof responseJson !== "object") {
    return "";
  }

  // OpenRouter's response shape is OpenAI-compatible chat completions:
  // { choices: [{ message: { content: "..." } }] }.
  const response = responseJson as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

class CulebraSettingTab extends PluginSettingTab {
  plugin: CulebraSpellCorrectPlugin;
  private creditsSummaryEl: HTMLElement | null = null;

  constructor(app: CulebraSpellCorrectPlugin["app"], plugin: CulebraSpellCorrectPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();


    containerEl.createEl("h2", { text: "Culebra AI Spell Correct" });

    new Setting(containerEl).setName("Settings mode").setDesc("Simple shows everyday controls. Advanced adds customization and troubleshooting.")
      .addDropdown(dropdown => dropdown.addOption("simple", "Simple").addOption("advanced", "Advanced")
        .setValue(this.plugin.settings.settingsMode).onChange(async value => {
          this.plugin.settings.settingsMode = value === "advanced" ? "advanced" : "simple";
          await this.plugin.saveSettings(); this.display();
        }));
    containerEl.createEl("h3", { text: "Getting started" });
    containerEl.createEl("p", {
      text:
        "Select text in a note, or leave the selection empty to correct the current note. Then choose Culebra from the editor menu, command palette, or a Markdown file's context menu. Culebra applies the correction immediately and supports Undo.",
    });

    new Setting(containerEl)
      .setName("Review before applying")
      .setDesc("Off by default for one-click corrections. Turn on to see a before/after review for each correction.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.reviewBeforeApply).onChange(async (value) => { this.plugin.settings.reviewBeforeApply = value; await this.plugin.saveSettings(); }));
    containerEl.createEl("p", {
      text:
        "Correction requests send only the text you explicitly choose to OpenRouter. Use Undo if a correction is not wanted.",
    });
    if (this.plugin.settings.settingsMode === "advanced") {
      new Setting(containerEl).setName("Managed model").setDesc("Constance selects the authorized economical model and output limits.");
      new Setting(containerEl).setName("AI request queue").setDesc("Inspect progress or remove waiting corrections; the active request continues.")
        .addButton(button => button.setButtonText("Show queue").onClick(() => this.plugin.aiQueue.open()));
      this.plugin.support.addDiagnosticsSetting(containerEl);
    }

    containerEl.createEl("h3", { text: "Credits & billing" });
    containerEl.createEl("p", {
      text:
        "Corrections are metered by input characters. Each billing account gets a one-time 2,000-character starter allowance across linked installations; buy more below when you run out.",
    });

    this.creditsSummaryEl = containerEl.createEl("p", { cls: "culebra-credits-summary" });
    this.renderCreditsSummary();

    addBillingAccountSettings(containerEl, { state: this.plugin.settings, appId: CONSTANCE_APP_ID, installationId: this.plugin.settings.constanceDeviceId, appVersion: this.plugin.manifest.version, persist: () => this.plugin.saveSettings(), syncBalance: () => syncPurchasedCreditsFromConstance(this.plugin), refresh: () => this.display() });

    addLivePacks(containerEl, gatewayFor(this.plugin.settings));

    new Setting(containerEl)
      .setName("Refresh balance")
      .setDesc("Pull the latest purchased-credit balance from Constance.")
      .addButton((button) =>
        button.setButtonText("Refresh balance").onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("Refreshing...");
          try { await syncPurchasedCreditsFromConstance(this.plugin, true); this.renderCreditsSummary(); }
          catch { new Notice("Could not refresh balance. Please try again."); }
          finally { button.setDisabled(false); button.setButtonText("Refresh balance"); }
        }),
      );

    // Sync on open so the summary reflects a purchase made since last time
    // Obsidian was open, without requiring a manual refresh click.
    void syncPurchasedCreditsFromConstance(this.plugin).then(() => this.renderCreditsSummary()).catch(() => {});
  }

  private renderCreditsSummary() {
    if (!this.creditsSummaryEl) {
      return;
    }
    const { freeCredits, purchasedCredits } = this.plugin.settings;
    const totalChars = freeCredits + purchasedCredits;
    this.creditsSummaryEl.setText(
      `Characters remaining: ${totalChars.toLocaleString()} (${freeCredits.toLocaleString()} free + ${purchasedCredits.toLocaleString()} purchased)`,
    );
  }
}
