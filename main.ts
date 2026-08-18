import {
  Editor,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
  TFile,
} from "obsidian";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-5-mini";

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
// One-time credit purchases only, no license keys. Uses the unsigned public
// browser-relay endpoints (the same shape a backend-less Obsidian plugin
// needs, since it can't hold a real HMAC signing secret any more than it
// can hold a real OpenRouter key): checkout via GET /buy, balance reads via
// POST /public/browser/entitlements, balance spend via POST
// /public/browser/credits/spend. Identity is this install's own
// constanceDeviceId, reused as both external_customer_id and machine_id
// (the "unsigned same-install lookup" model that endpoint requires).
const CONSTANCE_BASE_URL = "https://app.tutivsoft.com";
const CONSTANCE_APP_ID = "culebra-ai-spell-correct";
const CONSTANCE_PRICE_IDS: Record<"usd_001" | "usd_005" | "usd_015", string> = {
  usd_001: "PENDING_PROVISIONING", // $1  -> 100 corrections
  usd_005: "PENDING_PROVISIONING", // $5  -> 600 corrections
  usd_015: "PENDING_PROVISIONING", // $15 -> 2000 corrections
};

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

async function fetchConstanceEntitlements(deviceId: string): Promise<any> {
  const response = await requestUrl({
    url: `${CONSTANCE_BASE_URL}/api/v1/public/browser/entitlements`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: CONSTANCE_APP_ID,
      external_customer_id: deviceId,
      machine_id: deviceId,
    }),
    throw: false,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Entitlement sync failed: HTTP ${response.status}`);
  }
  return response.json?.data;
}

type SpendResult =
  | { kind: "ok"; balance: number }
  | { kind: "insufficient" }
  | { kind: "error" };

async function spendConstanceCredits(deviceId: string, amount: number): Promise<SpendResult> {
  try {
    const response = await requestUrl({
      url: `${CONSTANCE_BASE_URL}/api/v1/public/browser/credits/spend`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: CONSTANCE_APP_ID,
        external_customer_id: deviceId,
        machine_id: deviceId,
        amount,
        event_id: generateEventId(),
      }),
      throw: false,
    });

    // 402 = confirmed insufficient balance. 404 = no Constance customer
    // exists yet for this device (i.e. never purchased) -- also a
    // confirmed "0 purchased credits" state, not a transient failure, so
    // it must block rather than fail open (otherwise a user who never
    // buys anything would get unlimited corrections forever once their
    // free pool ran out).
    if (response.status === 402 || response.status === 404) {
      return { kind: "insufficient" };
    }
    if (response.status < 200 || response.status >= 300) {
      return { kind: "error" };
    }

    const balance = response.json?.data?.credits?.balance;
    return { kind: "ok", balance: Math.max(0, Number(balance) || 0) };
  } catch (error) {
    console.error("Culebra: Constance credit spend call failed", error);
    return { kind: "error" };
  }
}

async function syncPurchasedCreditsFromConstance(plugin: CulebraSpellCorrectPlugin): Promise<void> {
  if (!plugin.settings.constanceDeviceId) {
    return;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin.settings.constanceDeviceId);
    const serverBalance = entitlement?.credits?.balance;
    plugin.settings.purchasedCredits = Math.max(0, Number(serverBalance) || 0);
    await plugin.saveSettings();
  } catch (error) {
    console.error("Culebra: Constance entitlement sync failed", error);
  }
}

interface CulebraSettings {
  model: string;
  apiKey: string;
  constanceDeviceId: string;
  billingEmail: string;
  // Local-only starter allowance. Granted once, the first time a fresh
  // install merges this default (loadData() returns nothing on first run);
  // every load after that persists whatever remains. Never touches
  // Constance, same "keep the free grant local" decision Denali/Antero use.
  freeCredits: number;
  // Local mirror of the real Constance CreditBalance, kept in sync via
  // POST /public/browser/entitlements (see syncPurchasedCreditsFromConstance).
  purchasedCredits: number;
}

const DEFAULT_SETTINGS: CulebraSettings = {
  model: DEFAULT_MODEL,
  apiKey: "",
  constanceDeviceId: "",
  billingEmail: "",
  freeCredits: 15,
  purchasedCredits: 0,
};

export default class CulebraSpellCorrectPlugin extends Plugin {
  settings: CulebraSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    if (!this.settings.constanceDeviceId) {
      this.settings.constanceDeviceId = generateSecureDeviceId();
      await this.saveSettings();
    }

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor: Editor) => {
        menu.addItem((item) => {
          item
            .setTitle("Culebra AI Spell Correct")
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
            .setTitle("Culebra AI Spell Correct")
            .setIcon("spell-check")
            .onClick(() => {
              void this.correctFile(file);
            });
        });
      }),
    );

    this.addCommand({
      id: "spell-correct",
      name: "Culebra AI Spell Correct",
      editorCallback: (editor) => {
        void this.correctEditorText(editor);
      },
    });

    this.addSettingTab(new CulebraSettingTab(this.app, this));
    new Notice("Culebra AI Spell Correct loaded");

    // Background balance sync; never blocks load, fails silently offline.
    void syncPurchasedCreditsFromConstance(this);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  openBuyCheckout(tier: keyof typeof CONSTANCE_PRICE_IDS) {
    const email = this.settings.billingEmail.trim();
    if (!email) {
      new Notice("Enter a billing email in Culebra settings before buying credits.");
      return;
    }
    const priceId = CONSTANCE_PRICE_IDS[tier];
    const params = new URLSearchParams({
      app_id: CONSTANCE_APP_ID,
      price_id: priceId,
      email,
      external_customer_id: this.settings.constanceDeviceId,
    });
    // This plugin's manifest sets isDesktopOnly: false, so it must not
    // assume an Electron-only API like shell.openExternal is available.
    // window.open works on both the desktop app and Obsidian mobile.
    window.open(`${CONSTANCE_BASE_URL}/buy?${params.toString()}`, "_blank");
    this.pollAfterCheckout();
  }

  private pollAfterCheckout() {
    let attempts = 0;
    const intervalId = window.setInterval(() => {
      attempts += 1;
      void syncPurchasedCreditsFromConstance(this);
      if (attempts >= 6) {
        window.clearInterval(intervalId);
      }
    }, 15000);
  }

  /**
   * Charges 1 credit for a single correction operation (App_Credit_Unit_Name
   * is "corrections" -- flat per-invocation cost, not metered by character).
   * Spends the local free pool first, then the Constance-backed purchased
   * pool. Returns false (and shows a Notice) only when both are confirmed
   * exhausted; a network/error response fails open per Antero's policy.
   */
  private async chargeOneCredit(): Promise<boolean> {
    if (this.settings.freeCredits > 0) {
      this.settings.freeCredits -= 1;
      await this.saveSettings();
      return true;
    }

    const result = await spendConstanceCredits(this.settings.constanceDeviceId, 1);
    if (result.kind === "ok") {
      this.settings.purchasedCredits = result.balance;
      await this.saveSettings();
      return true;
    }
    if (result.kind === "insufficient") {
      this.settings.purchasedCredits = 0;
      await this.saveSettings();
      new Notice("Culebra: out of credits. Buy more in plugin settings (Buy $1 / $5 / $15).");
      return false;
    }

    // Network error or unexpected non-insufficient status: fail open,
    // proceed with the AI call, and let the next sync reconcile the local
    // purchasedCredits mirror against Constance's real balance.
    console.warn("Culebra: credit spend check failed; proceeding and will reconcile on next sync.");
    return true;
  }

  private async correctEditorText(editor: Editor) {
    const selection = editor.getSelection();
    const hasSelection = selection.trim().length > 0;
    const originalText = hasSelection ? selection : editor.getValue();
    const target = hasSelection ? "selection" : "current note";

    const correctedText = await this.correctText(originalText, target);
    if (!correctedText) {
      return;
    }

    if (hasSelection) {
      editor.replaceSelection(correctedText);
    } else {
      editor.setValue(correctedText);
    }

    new Notice(`Culebra corrected ${target}.`);
  }

  private async correctFile(file: TFile) {
    const originalText = await this.app.vault.read(file);
    const correctedText = await this.correctText(originalText, file.name);

    if (!correctedText) {
      return;
    }

    await this.app.vault.modify(file, correctedText);
    new Notice(`Culebra corrected ${file.name}.`);
  }

  private async correctText(originalText: string, targetLabel: string) {
    if (!originalText.trim()) {
      new Notice("Culebra found no text to correct.");
      return null;
    }

    const apiKey = this.settings.apiKey.trim();
    if (!apiKey) {
      new Notice("Add your OpenRouter API key in Culebra settings before correcting text.");
      return null;
    }

    const charged = await this.chargeOneCredit();
    if (!charged) {
      return null;
    }

    new Notice(`Culebra is correcting ${targetLabel}...`);

    try {
      const response = await requestUrl({
        url: OPENROUTER_CHAT_COMPLETIONS_URL,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.settings.model.trim() || DEFAULT_MODEL,
          messages: [
            { role: "system", content: SPELL_CORRECT_INSTRUCTIONS },
            { role: "user", content: originalText },
          ],
        }),
        throw: false,
      });

      if (response.status < 200 || response.status >= 300) {
        console.error("Culebra AI Spell Correct failed", response.status, response.text);
        new Notice("Culebra correction failed. Check the developer console.");
        return null;
      }

      const correctedText = extractResponseText(response.json);

      if (!correctedText.trim()) {
        new Notice("Culebra received an empty response; no changes made.");
        return null;
      }

      return correctedText;
    } catch (error) {
      console.error("Culebra AI Spell Correct failed", error);
      new Notice("Culebra correction failed. Check the developer console.");
      return null;
    }
  }
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

    new Setting(containerEl)
      .setName("Model")
      .setDesc(`OpenRouter model id. Default: ${DEFAULT_MODEL}`)
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_MODEL)
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim() || DEFAULT_MODEL;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("OpenRouter API key")
      .setDesc("Stored locally in this vault and sent only to OpenRouter for corrections.")
      .addText((text) =>
        text.setPlaceholder("sk-or-...").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        }),
      );
    const apiKeyInput = containerEl.querySelector<HTMLInputElement>("input[placeholder='sk-or-...']");
    if (apiKeyInput) {
      apiKeyInput.type = "password";
    }

    containerEl.createEl("h3", { text: "Credits & billing" });
    containerEl.createEl("p", {
      text:
        "Each correction costs 1 credit. New installs start with 15 free credits; buy more below when you run out.",
    });

    this.creditsSummaryEl = containerEl.createEl("p", { cls: "culebra-credits-summary" });
    this.renderCreditsSummary();

    new Setting(containerEl)
      .setName("Billing email")
      .setDesc("Used for your Paddle purchase receipt. Not required to check your balance -- that uses this device's id.")
      .addText((text) =>
        text
          .setPlaceholder("you@example.com")
          .setValue(this.plugin.settings.billingEmail)
          .onChange(async (value) => {
            this.plugin.settings.billingEmail = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Buy credits")
      .setDesc("Opens TutivSoft billing (Constance) in your browser to complete payment via Paddle.")
      .addButton((button) =>
        button.setButtonText("Buy $1 (100 corrections)").onClick(() => {
          this.plugin.openBuyCheckout("usd_001");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Buy $5 (600 corrections)").onClick(() => {
          this.plugin.openBuyCheckout("usd_005");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Buy $15 (2000 corrections)").onClick(() => {
          this.plugin.openBuyCheckout("usd_015");
        }),
      );

    new Setting(containerEl)
      .setName("Refresh balance")
      .setDesc("Pull the latest purchased-credit balance from Constance.")
      .addButton((button) =>
        button.setButtonText("Refresh balance").onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("Refreshing...");
          await syncPurchasedCreditsFromConstance(this.plugin);
          this.renderCreditsSummary();
          button.setDisabled(false);
          button.setButtonText("Refresh balance");
        }),
      );

    // Sync on open so the summary reflects a purchase made since last time
    // Obsidian was open, without requiring a manual refresh click.
    void syncPurchasedCreditsFromConstance(this.plugin).then(() => this.renderCreditsSummary());
  }

  private renderCreditsSummary() {
    if (!this.creditsSummaryEl) {
      return;
    }
    const { freeCredits, purchasedCredits } = this.plugin.settings;
    this.creditsSummaryEl.setText(
      `Credits remaining: ${freeCredits + purchasedCredits} (${freeCredits} free + ${purchasedCredits} purchased)`,
    );
  }
}
