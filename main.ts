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
import { addBillingAccountSettings, claimAccountFreeUsage, spendAccountCredits } from "./constance-account";
import { PluginSupport } from "./plugin-support";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "~deepseek/deepseek-v4-flash-latest";

// --- Pattern B remote key manifest (TutivSoft.OpenAiKeyManifest port) ---
// Fetches this app's own encrypted OpenRouter key from a GitHub-hosted manifest
// instead of requiring the user to paste one. Same algorithm as the C# reference
// (desktop-app-Windows-Kest-LLM-Chat-AI/.../RemoteOpenAiKeyManifest.cs) and the
// verified Python port (tool-python-openrouter-manifest-crypto): AES-256-GCM +
// PBKDF2-HMAC-SHA256, 210,000 iterations. The manual "OpenRouter API key" setting
// remains as a user override that takes priority when set.
const REMOTE_MANIFEST_PASSPHRASE = "Kivu.RemoteKeyManifest.v1.2026D";
const REMOTE_MANIFEST_URL =
  "https://raw.githubusercontent.com/tutivsoft-com/Resources/main/tool-app-Culebra-Obsidian-AI-Auto-Correct-Spelling.txt";

interface EncryptedSecretEnvelope {
  q: number;
  x: string;
  w: string;
  n: number;
  a: string;
  b: string;
  c: string;
  d: string;
}

interface RemoteKeySlot {
  i: string;
  ii?: string;
  s: string;
  v: EncryptedSecretEnvelope;
}

interface RemoteKeyManifest {
  m: number;
  n?: string; // next manifest URL (decoy-adjacent field, same shape as the live ai1.txt)
  r: RemoteKeySlot[];
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function decryptSecretEnvelope(envelope: EncryptedSecretEnvelope, passphrase: string): Promise<string> {
  if (envelope.x !== "AES-256-GCM" || envelope.w !== "PBKDF2-HMAC-SHA256") {
    throw new Error(`Unsupported manifest envelope algorithm/kdf: ${envelope.x} / ${envelope.w}`);
  }

  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(envelope.a),
      iterations: envelope.n,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const ciphertext = base64ToBytes(envelope.c);
  const tag = base64ToBytes(envelope.d);
  const ciphertextAndTag = new Uint8Array<ArrayBuffer>(new ArrayBuffer(ciphertext.length + tag.length));
  ciphertextAndTag.set(ciphertext, 0);
  ciphertextAndTag.set(tag, ciphertext.length);

  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.b) },
    key,
    ciphertextAndTag,
  );

  return new TextDecoder().decode(plaintext);
}

function selectSlot(manifest: RemoteKeyManifest, wantState: "active" | "next"): RemoteKeySlot | null {
  const byMarker = manifest.r.find((slot) => slot.ii === wantState);
  if (byMarker) {
    return byMarker;
  }
  // Fallback for manifests without the "ii" marker (matches the C# lib's
  // ActiveKeyId/State-based selection): active = state "0", next = state "1".
  const fallbackState = wantState === "active" ? "0" : "1";
  return manifest.r.find((slot) => slot.s === fallbackState) ?? null;
}

async function fetchRemoteManifest(url: string): Promise<RemoteKeyManifest> {
  const response = await requestUrl({ url, method: "GET", throw: false });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Manifest fetch failed: HTTP ${response.status}`);
  }
  return response.json as RemoteKeyManifest;
}

async function tryDecryptManifestKey(manifest: RemoteKeyManifest, source: string): Promise<string> {
  const active = selectSlot(manifest, "active");
  if (active) {
    try {
      const key = (await decryptSecretEnvelope(active.v, REMOTE_MANIFEST_PASSPHRASE)).trim();
      if (key) return key;
    } catch (error) {
      console.warn("Culebra: active manifest slot failed to decrypt", source, error);
    }
  }

  const next = selectSlot(manifest, "next");
  if (next) {
    try {
      const key = (await decryptSecretEnvelope(next.v, REMOTE_MANIFEST_PASSPHRASE)).trim();
      if (key) return key;
    } catch (error) {
      console.warn("Culebra: next manifest slot failed to decrypt", source, error);
    }
  }

  throw new Error("Remote key manifest did not decrypt to a usable key.");
}

/**
 * Fetches and decrypts this app's own OpenRouter key from its GitHub manifest,
 * falling back to the manifest's NextManifestUrl if the primary one is
 * unreachable or fails to decrypt (key rotation / relocation support).
 */
async function fetchRemoteApiKey(): Promise<string> {
  try {
    const manifest = await fetchRemoteManifest(REMOTE_MANIFEST_URL);
    return await tryDecryptManifestKey(manifest, REMOTE_MANIFEST_URL);
  } catch (primaryError) {
    console.warn("Culebra: primary manifest failed, trying next-manifest fallback", primaryError);
    const primaryManifest = await fetchRemoteManifest(REMOTE_MANIFEST_URL).catch(() => null);
    const nextUrl = primaryManifest?.n;
    if (nextUrl && nextUrl !== REMOTE_MANIFEST_URL) {
      const nextManifest = await fetchRemoteManifest(nextUrl);
      return await tryDecryptManifestKey(nextManifest, nextUrl);
    }
    throw primaryError;
  }
}

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
// Authenticated Constance account endpoints are used for balance reads and
// spends; checkout remains the hosted /buy flow.
const CONSTANCE_BASE_URL = "https://app.tutivsoft.com";
const CONSTANCE_APP_ID = "culebra-ai-spell-correct";
const CONSTANCE_PRICE_IDS: Record<"usd_001" | "usd_005" | "usd_015", string> = {
  usd_001: "pri_01m0b7grv1cmt42gqfpc0v835k", // $1  -> 20,000 characters
  usd_005: "pri_01m0b7gsghrh315zvfxnxx4w38", // $5  -> 160,000 characters
  usd_015: "pri_01m0b7gt2jyj6s2a6dpkdvfdsr", // $15 -> 640,000 characters
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

async function fetchConstanceEntitlements(plugin: CulebraSpellCorrectPlugin): Promise<any> {
  if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) return null;
  const query = new URLSearchParams({ app_id: CONSTANCE_APP_ID, installation_id: plugin.settings.constanceDeviceId });
  const response = await requestUrl({
    url: `${CONSTANCE_BASE_URL}/api/v1/billing/entitlements/me?${query.toString()}`,
    method: "GET",
    headers: { Authorization: `Bearer ${plugin.settings.billingAccessToken}` },
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

async function spendConstanceCredits(plugin: CulebraSpellCorrectPlugin, amount: number, stableEventId: string): Promise<SpendResult> {
  const result = await spendAccountCredits(plugin.settings, CONSTANCE_APP_ID, plugin.settings.constanceDeviceId, stableEventId, amount);
  if (result.kind === "ok" || result.kind === "insufficient" || result.kind === "error") return result;
  plugin.settings.billingAccessToken = "";
  plugin.settings.billingAccountLinked = false;
  await plugin.saveSettings();
  return { kind: "error" };
}

async function syncPurchasedCreditsFromConstance(plugin: CulebraSpellCorrectPlugin): Promise<void> {
  if (!plugin.settings.constanceDeviceId) {
    return;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin);
    const serverBalance = entitlement?.credits?.balance;
    plugin.settings.purchasedCredits = Math.max(0, Number(serverBalance) || 0);
    await plugin.saveSettings();
  } catch (error) {
    console.error("Culebra: Constance entitlement sync failed", error);
  }
}

async function retryPendingSpendEvents(plugin: CulebraSpellCorrectPlugin): Promise<void> {
  const pending = [...(plugin.settings.pendingSpendEvents ?? [])];
  for (const event of pending) {
    const result = await spendConstanceCredits(plugin, event.amount, event.eventId);
    if (result.kind === "error") break;
    plugin.settings.pendingSpendEvents = plugin.settings.pendingSpendEvents.filter((item) => item.eventId !== event.eventId);
    if (result.kind === "ok") plugin.settings.purchasedCredits = result.balance;
    else plugin.settings.purchasedCredits = 0;
    await plugin.saveSettings();
  }
}

interface CulebraSettings {
  model: string;
  apiKey: string;
  constanceDeviceId: string;
  billingEmail: string;
  billingAccessToken: string;
  billingAccountLinked: boolean;
  // Local-only starter allowance. Granted once, the first time a fresh
  // install merges this default (loadData() returns nothing on first run);
  // every load after that persists whatever remains. Never touches
  // Constance, same "keep the free grant local" decision Denali/Antero use.
  freeCredits: number;
  // Local mirror of the real Constance CreditBalance, refreshed through the
  // authenticated account entitlement endpoint.
  purchasedCredits: number;
  // Events are written before a paid correction starts. Unknown transport
  // outcomes stay here and are retried with the same event ID after restart.
  pendingSpendEvents: Array<{ eventId: string; amount: number }>;
  onboardingSeen: boolean;
}

const DEFAULT_SETTINGS: CulebraSettings = {
  model: DEFAULT_MODEL,
  apiKey: "",
  constanceDeviceId: "",
  billingEmail: "",
  billingAccessToken: "",
  billingAccountLinked: false,
  freeCredits: 2000,
  purchasedCredits: 0,
  pendingSpendEvents: [],
  onboardingSeen: false,
};

/**
 * Coordinates Culebra's user-facing correction flow: resolve a provider,
 * preview the proposed edit, ask for confirmation, then apply one reversible
 * change to the selection, note, or chosen file.
 */
export default class CulebraSpellCorrectPlugin extends Plugin {
  support!: PluginSupport;
  settings: CulebraSettings = DEFAULT_SETTINGS;
  // Cached once resolved so every correction doesn't re-fetch the manifest;
  // cleared and retried on failure in case the key was rotated mid-session.
  private remoteApiKeyCache: string | null = null;

  private async resolveApiKey(): Promise<string> {
    const manualKey = this.settings.apiKey.trim();
    if (manualKey) {
      return manualKey;
    }
    if (this.remoteApiKeyCache) {
      return this.remoteApiKeyCache;
    }
    const key = await fetchRemoteApiKey();
    this.remoteApiKeyCache = key;
    return key;
  }

  async onload() {
    this.support = new PluginSupport(this, { name: "Culebra AI Spell Correct", summary: "Correct selected text or an entire note with a review-first AI workflow.", quickStart: ["Sign in to billing in Settings.", "Select text or open a Markdown note.", "Run a Culebra correction command and review the preview before applying."], commands: ["Correct selected text", "Correct current note", "Undo last correction"], troubleshooting: ["Use Copy debug log before reporting a problem.", "Confirm the note is editable and the billing account is linked."] });
    this.support.start();
    await this.loadSettings();

    if (!this.settings.constanceDeviceId) {
      this.settings.constanceDeviceId = generateSecureDeviceId();
      await this.saveSettings();
    }
    this.settings.pendingSpendEvents = Array.isArray(this.settings.pendingSpendEvents)
      ? this.settings.pendingSpendEvents.filter((item) => item && typeof item.eventId === "string" && Number.isInteger(item.amount) && item.amount > 0)
      : [];
    this.settings.billingAccessToken = typeof this.settings.billingAccessToken === "string" ? this.settings.billingAccessToken : "";
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
      name: "Culebra: Correct selection or current note",
      editorCallback: (editor) => {
        void this.correctEditorText(editor);
      },
    });

    this.addSettingTab(new CulebraSettingTab(this.app, this));
    // Background balance sync; never blocks load, fails silently offline.
    void syncPurchasedCreditsFromConstance(this).then(() => retryPendingSpendEvents(this));
  }

  async loadSettings() {
    const savedSettings = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
    // Existing installs predate the onboarding flag; do not show a first-run
    // notice to them after upgrading.
    if (savedSettings && typeof savedSettings.onboardingSeen !== "boolean") {
      this.settings.onboardingSeen = true;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  openBuyCheckout(tier: keyof typeof CONSTANCE_PRICE_IDS) {
    if (!this.settings.billingAccessToken || !this.settings.billingAccountLinked) { new Notice("Sign in or create a billing account in Culebra settings before buying characters."); return; }
    const email = this.settings.billingEmail.trim();
    if (!email) {
      new Notice("Enter a billing email in Culebra settings before buying credits.");
      return;
    }
    const priceId = CONSTANCE_PRICE_IDS[tier];
    if (!priceId || priceId === "PENDING_PROVISIONING") {
      new Notice("Culebra billing is not available yet because Paddle prices are still being provisioned.");
      return;
    }
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
   * Reserves the character-based cost only after the user approves a preview.
   * The local free-character pool is used first, followed by the Constance
    * balance; transient balance failures fail open so an approved edit is not
    * silently discarded.
    */
  private async chargeOneCredit(textLength: number): Promise<boolean> {
    const cost = Math.max(1, Math.ceil(textLength));
    if (!this.settings.billingAccessToken || !this.settings.billingAccountLinked) {
      new Notice("Culebra: sign in or create a billing account in plugin settings before correcting text.");
      return false;
    }
    const free = await claimAccountFreeUsage(this.settings, CONSTANCE_APP_ID, this.settings.constanceDeviceId, `free_${generateEventId()}`, cost);
    if (free.kind === "ok") {
      this.settings.freeCredits = free.remaining;
      await this.saveSettings();
      return true;
    }
    if (free.kind === "auth-required") { this.settings.billingAccessToken = ""; this.settings.billingAccountLinked = false; await this.saveSettings(); new Notice("Culebra: your billing session expired. Sign in again."); return false; }
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
      new Notice("Culebra: out of characters. Buy more in plugin settings (Buy $1 / $5 / $15).");
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

    const shouldApply = await new CorrectionPreviewModal(
      this.app,
      target,
      originalText,
      correctedText,
    ).waitForDecision();
    if (!shouldApply || !(await this.chargeOneCredit(originalText.length))) {
      return;
    }

    if (hasSelection) {
      editor.replaceSelection(correctedText);
    } else {
      editor.setValue(correctedText);
    }

    new Notice(`Culebra corrected ${target}. Undo with Ctrl/Cmd+Z if needed.`);
  }

   /** Preview and, after approval, replace the contents of one Markdown file. */
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

    const shouldApply = await new CorrectionPreviewModal(
      this.app,
      file.name,
      originalText,
      correctedText,
    ).waitForDecision();
    if (!shouldApply || !(await this.chargeOneCredit(originalText.length))) {
      return;
    }

    await this.app.vault.modify(file, correctedText);
    new Notice(`Culebra corrected ${file.name}.`);
  }

   /** Ask the configured provider for corrected text without mutating the vault. */
   private async correctText(originalText: string, targetLabel: string) {
    if (!originalText.trim()) {
      new Notice("Culebra found no text to correct.");
      return null;
    }

    let apiKey: string;
    try {
      apiKey = await this.resolveApiKey();
    } catch (error) {
      console.error("Culebra: failed to resolve an OpenRouter API key", error);
      new Notice("Culebra could not fetch its built-in API key. Check your connection, or add your own OpenRouter key in settings.");
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

    containerEl.createEl("h3", { text: "Getting started" });
    containerEl.createEl("p", {
      text:
        "Select text in a note, or leave the selection empty to correct the current note. Then choose Culebra from the editor menu, command palette, or a Markdown file's context menu. Culebra shows a before-and-after preview before applying anything.",
    });
    containerEl.createEl("p", {
      text:
        "Correction requests send only the text you explicitly choose to OpenRouter. Review the preview carefully before applying it.",
    });

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
      .setName("OpenRouter API key (optional)")
      .setDesc("Culebra fetches its own built-in key automatically. Only set this to override it with your own OpenRouter key.")
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
        "Corrections are metered by input characters. Each billing account gets a one-time 2,000-character starter allowance across linked installations; buy more below when you run out.",
    });

    this.creditsSummaryEl = containerEl.createEl("p", { cls: "culebra-credits-summary" });
    this.renderCreditsSummary();

    addBillingAccountSettings(containerEl, { state: this.plugin.settings, appId: CONSTANCE_APP_ID, installationId: this.plugin.settings.constanceDeviceId, appVersion: this.plugin.manifest.version, persist: () => this.plugin.saveSettings(), syncBalance: () => syncPurchasedCreditsFromConstance(this.plugin), refresh: () => this.display() });

    new Setting(containerEl)
      .setName("Buy credits")
      .setDesc("Opens TutivSoft billing (Constance) in your browser to complete payment via Paddle.")
      .addButton((button) =>
        button.setButtonText("Buy $1 (20,000 characters)").onClick(() => {
          this.plugin.openBuyCheckout("usd_001");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Buy $5 (160,000 characters)").onClick(() => {
          this.plugin.openBuyCheckout("usd_005");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Buy $15 (640,000 characters)").onClick(() => {
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
    const totalChars = freeCredits + purchasedCredits;
    this.creditsSummaryEl.setText(
      `Characters remaining: ${totalChars.toLocaleString()} (${freeCredits.toLocaleString()} free + ${purchasedCredits.toLocaleString()} purchased)`,
    );
  }
}

class CorrectionPreviewModal extends Modal {
  private readonly decision: Promise<boolean>;
  private resolveDecision!: (accepted: boolean) => void;
  private settled = false;

  constructor(
    app: CulebraSpellCorrectPlugin["app"],
    private readonly targetLabel: string,
    private readonly originalText: string,
    private readonly correctedText: string,
  ) {
    super(app);
    this.decision = new Promise((resolve) => {
      this.resolveDecision = resolve;
    });
  }

  waitForDecision(): Promise<boolean> {
    this.open();
    return this.decision;
  }

  onOpen() {
    this.setTitle(`Review correction: ${this.targetLabel}`);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", {
      text: "Review the proposed changes. Nothing will be changed until you apply the correction.",
    });

    const previewGrid = contentEl.createDiv({ cls: "culebra-preview-grid" });
    const before = previewGrid.createDiv({ cls: "culebra-preview-pane" });
    before.createEl("h3", { text: "Before" });
    before.createEl("pre", { cls: "culebra-preview-text", text: this.originalText });

    const after = previewGrid.createDiv({ cls: "culebra-preview-pane" });
    after.createEl("h3", { text: "After" });
    after.createEl("pre", { cls: "culebra-preview-text", text: this.correctedText });

    const buttons = contentEl.createDiv({ cls: "modal-button-container" });
    const cancelButton = buttons.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.finish(false));
    const applyButton = buttons.createEl("button", { text: "Apply correction" });
    applyButton.classList.add("mod-cta");
    applyButton.addEventListener("click", () => this.finish(true));
  }

  onClose() {
    this.finish(false);
  }

  private finish(accepted: boolean) {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolveDecision(accepted);
    this.close();
  }
}
