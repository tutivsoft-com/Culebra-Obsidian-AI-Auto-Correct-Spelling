import { selectedFiles, markdownFile, registerSelectionAction } from "./selection-scope";
import { diagnostics } from "./diagnostics";
import { consumeAccountUnits } from "./account-credit-client";
import { showAccountWelcome } from "./constance-account";
import { resumeAccountCheckout } from "./billing-checkout";
import { refreshBillingSession } from "./constance-account";
import { addLivePacks } from "./billing-catalog";
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
const DEFAULT_MODEL = "~openai/gpt-luna-latest";

// --- Pattern B remote key manifest (TutivSoft.OpenAiKeyManifest port) ---
// Fetches this app's own encrypted OpenRouter key from a GitHub-hosted manifest
// instead of requiring the user to paste one. Same algorithm as the C# reference
// (desktop-app-Windows-Kest-LLM-Chat-AI/.../RemoteOpenAiKeyManifest.cs) and the
// verified Python port (tool-python-openrouter-manifest-crypto): AES-256-GCM +
// PBKDF2-HMAC-SHA256, 210,000 iterations. Only the managed key is used.
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
const diagnosticEnd1 = diagnostics?.start?.("main.decryptSecretEnvelope") ?? (() => {});
try {

  if (envelope.x !== "AES-256-GCM" || envelope.w !== "PBKDF2-HMAC-SHA256") {
    throw new Error(`The AI connection could not be initialized. Update the plugin or contact support.`);
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

  return await (new TextDecoder().decode(plaintext));

} catch (diagnosticError1) { diagnostics?.failure?.("main.decryptSecretEnvelope", diagnosticError1); throw diagnosticError1; } finally { diagnosticEnd1(); }
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
const diagnosticEnd2 = diagnostics?.start?.("main.fetchRemoteManifest") ?? (() => {});
try {

  const response = await (diagnostics?.request?.("network.main.fetchRemoteManifest", requestUrl, { url, method: "GET", throw: false }) ?? requestUrl({ url, method: "GET", throw: false }));
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`The AI connection is unavailable. Check your connection and try again.`);
  }
  return await (response.json as RemoteKeyManifest);

} catch (diagnosticError2) { diagnostics?.failure?.("main.fetchRemoteManifest", diagnosticError2); throw diagnosticError2; } finally { diagnosticEnd2(); }
}

async function tryDecryptManifestKey(manifest: RemoteKeyManifest, source: string): Promise<string> {
const diagnosticEnd3 = diagnostics?.start?.("main.tryDecryptManifestKey") ?? (() => {});
try {

  const active = selectSlot(manifest, "active");
  if (active) {
    try {
      const key = (await decryptSecretEnvelope(active.v, REMOTE_MANIFEST_PASSPHRASE)).trim();
      if (key) return await (key);
    } catch (error) {
diagnostics.failure("main.caught_extra_1", error);
      diagnostics?.legacy?.("warn", "main.culebra_active_manifest_slot_failed_to_decrypt");
    }
  }

  const next = selectSlot(manifest, "next");
  if (next) {
    try {
      const key = (await decryptSecretEnvelope(next.v, REMOTE_MANIFEST_PASSPHRASE)).trim();
      if (key) return await (key);
    } catch (error) {
diagnostics.failure("main.caught_extra_2", error);
      diagnostics?.legacy?.("warn", "main.culebra_next_manifest_slot_failed_to_decrypt");
    }
  }

  throw new Error("The AI connection is unavailable. Check your connection and try again.");

} catch (diagnosticError3) { diagnostics?.failure?.("main.tryDecryptManifestKey", diagnosticError3); throw diagnosticError3; } finally { diagnosticEnd3(); }
}

/**
 * Fetches and decrypts this app's own OpenRouter key from its GitHub manifest,
 * falling back to the manifest's NextManifestUrl if the primary one is
 * unreachable or fails to decrypt (key rotation / relocation support).
 */
async function fetchRemoteApiKey(): Promise<string> {
const diagnosticEnd4 = diagnostics?.start?.("main.fetchRemoteApiKey") ?? (() => {});
try {

  try {
    const manifest = await fetchRemoteManifest(REMOTE_MANIFEST_URL);
    return await tryDecryptManifestKey(manifest, REMOTE_MANIFEST_URL);
  } catch (primaryError) {
diagnostics.failure("main.caught_extra_3", primaryError);
    diagnostics?.legacy?.("warn", "main.culebra_primary_manifest_failed_trying_next_manifest_fallback");
    const primaryManifest = await fetchRemoteManifest(REMOTE_MANIFEST_URL).catch((rejectedError1) => { diagnostics.failure("main.rejected_2", rejectedError1); return (null); });
    const nextUrl = primaryManifest?.n;
    if (nextUrl && nextUrl !== REMOTE_MANIFEST_URL) {
      const nextManifest = await fetchRemoteManifest(nextUrl);
      return await tryDecryptManifestKey(nextManifest, nextUrl);
    }
    throw primaryError;
  }

} catch (diagnosticError4) { diagnostics?.failure?.("main.fetchRemoteApiKey", diagnosticError4); throw diagnosticError4; } finally { diagnosticEnd4(); }
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
// One-time credit purchases only, no license keys. Authenticated Constance
// account endpoints are used for balance reads, free-usage claims, spends, and
// preferred catalog-code checkout; /buy is retained only as a fallback.
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
const diagnosticEnd5 = diagnostics?.start?.("main.fetchConstanceEntitlements") ?? (() => {});
try {

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
    throw new Error(`Your account could not be updated. Check your connection and try again.`);
  }
  return await (response.json?.data);

} catch (diagnosticError5) { diagnostics?.failure?.("main.fetchConstanceEntitlements", diagnosticError5); throw diagnosticError5; } finally { diagnosticEnd5(); }
}

type SpendResult =
  | { kind: "ok"; balance: number }
  | { kind: "insufficient" }
  | { kind: "error" };

async function spendConstanceCredits(plugin: CulebraSpellCorrectPlugin, amount: number, stableEventId: string): Promise<SpendResult> {
const diagnosticEnd6 = diagnostics?.start?.("main.spendConstanceCredits") ?? (() => {});
try {

  if (stableEventId.startsWith("consume_")) {
    const result = await consumeAccountUnits({ state: plugin.settings, appId: CONSTANCE_APP_ID, installationId: plugin.settings.constanceDeviceId, refreshSession: () => refreshBillingSession(plugin.settings, () => plugin.saveSettings()) }, stableEventId, amount);
    if (result.kind === "ok") {
      plugin.settings.freeCredits = result.freeRemaining ?? plugin.settings.freeCredits;
      return { kind: "ok", balance: result.balance ?? plugin.settings.purchasedCredits };
    }
    return { kind: result.kind === "insufficient" ? "insufficient" : "error" };
  }
  const result = await spendAccountCredits(plugin.settings, () => plugin.saveSettings(), CONSTANCE_APP_ID, plugin.settings.constanceDeviceId, stableEventId, amount);
  if (result.kind === "ok" || result.kind === "insufficient" || result.kind === "error") return await (result);
  clearBillingSession(plugin.settings);
  await plugin.saveSettings();
  return { kind: "error" };

} catch (diagnosticError6) { diagnostics?.failure?.("main.spendConstanceCredits", diagnosticError6); throw diagnosticError6; } finally { diagnosticEnd6(); }
}

async function syncPurchasedCreditsFromConstance(plugin: CulebraSpellCorrectPlugin, manual = false): Promise<void> {
const diagnosticEnd7 = diagnostics?.start?.("main.syncPurchasedCreditsFromConstance") ?? (() => {});
try {

  resumeAccountCheckout({ state: plugin.settings, appId: CONSTANCE_APP_ID, installationId: plugin.settings.constanceDeviceId,
    persist: () => plugin.saveSettings(), syncBalance: () => syncPurchasedCreditsFromConstance(plugin), refreshSession: () => refreshBillingSession(plugin.settings, () => plugin.saveSettings()) });

  if (!plugin.settings.constanceDeviceId) {
    return;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin);
    const serverBalance = (entitlement?.credits?.total_available ?? entitlement?.credits?.balance);
    const freeRemaining = entitlement?.free_usage?.remaining;
    if (!Number.isFinite(serverBalance) || serverBalance < 0 || !Number.isFinite(freeRemaining) || freeRemaining < 0) throw new Error("Your balance could not be updated. Refresh it and try again.");
    plugin.settings.freeCredits = freeRemaining;
    plugin.settings.purchasedCredits = Math.max(0, Number(serverBalance) || 0);
    await plugin.saveSettings();
    plugin.refreshBillingCredits?.();
  } catch (error) {
diagnostics.failure("main.caught_1", error);
    if (manual) throw error;
    diagnostics?.legacy?.("error", "main.culebra_constance_entitlement_sync_failed");
  }

} catch (diagnosticError7) { diagnostics?.failure?.("main.syncPurchasedCreditsFromConstance", diagnosticError7); throw diagnosticError7; } finally { diagnosticEnd7(); }
}

async function retryPendingSpendEvents(plugin: CulebraSpellCorrectPlugin): Promise<void> {
const diagnosticEnd8 = diagnostics?.start?.("main.retryPendingSpendEvents") ?? (() => {});
try {

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

} catch (diagnosticError8) { diagnostics?.failure?.("main.retryPendingSpendEvents", diagnosticError8); throw diagnosticError8; } finally { diagnosticEnd8(); }
}

async function checkBillingBeforeAi(plugin: CulebraSpellCorrectPlugin, amount: number): Promise<boolean> {
const diagnosticEnd9 = diagnostics?.start?.("main.checkBillingBeforeAi") ?? (() => {});
try {

  if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) {
    new Notice("Culebra: sign in or create an account in plugin settings before sending text to AI.");
    return false;
  }
  await retryPendingSpendEvents(plugin);
  if (plugin.settings.pendingSpendEvents.length > 0) {
    new Notice("Culebra: a previous charge is still being confirmed. No AI request was sent.");
    return false;
  }
  try {
    const entitlement = await fetchConstanceEntitlements(plugin);
    const freeRemaining = Math.max(0, Number(entitlement?.free_usage?.remaining) || 0);
    const paidBalance = Math.max(0, Number((entitlement?.credits?.total_available ?? entitlement?.credits?.balance)) || 0);
    plugin.settings.freeCredits = freeRemaining;
    plugin.settings.purchasedCredits = paidBalance;
    await plugin.saveSettings();
    if (freeRemaining + paidBalance >= amount) return true;
    new Notice("Culebra: not enough free or purchased characters. No AI request was sent.");
    return false;
  } catch (caughtError2) {
diagnostics.failure("main.caught_3", caughtError2);
    if (!plugin.settings.billingAccessToken || !plugin.settings.billingAccountLinked) {
      new Notice("Culebra: your session expired. Sign in again before using AI.");
    } else {
      new Notice("Culebra: your account could not be verified. No AI request was sent.");
    }
    return false;
  }

} catch (diagnosticError9) { diagnostics?.failure?.("main.checkBillingBeforeAi", diagnosticError9); throw diagnosticError9; } finally { diagnosticEnd9(); }
}

interface CulebraSettings {
  settingsMode: "simple" | "advanced";
  debugLogging?: boolean;
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
  debugLogging: false,
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
  refreshBillingCredits?: () => void;
  support!: PluginSupport;
  settings: CulebraSettings = DEFAULT_SETTINGS;
  aiQueue!: AiRequestQueue;
  // Cached once resolved so every correction doesn't re-fetch the manifest;
  // cleared and retried on failure in case the key was rotated mid-session.
  private remoteApiKeyCache: string | null = null;

  private async resolveApiKey(): Promise<string> {
const diagnosticEnd10 = diagnostics?.start?.("main.resolveApiKey") ?? (() => {});
try {

    if (this.remoteApiKeyCache) {
      return await (this.remoteApiKeyCache);
    }
    const key = await fetchRemoteApiKey();
    this.remoteApiKeyCache = key;
    return await (key);

} catch (diagnosticError10) { diagnostics?.failure?.("main.resolveApiKey", diagnosticError10); throw diagnosticError10; } finally { diagnosticEnd10(); }
}

  async onload() {
let diagnosticStartupEnd: () => void = () => {};

const diagnosticEnd11 = diagnostics?.start?.("main.onload") ?? (() => {});
try {

    this.support = new PluginSupport(this, { name: "Culebra AI Spell Correct", summary: "Correct spelling, grammar, and punctuation in selected text or a note.", quickStart: ["Sign in to your account in Settings.", "Select text or open a Markdown note.", "Run a Culebra correction command; edits apply automatically and can be undone."], commands: ["Correct selected text", "Correct current note", "Undo last correction"], troubleshooting: ["Use Copy diagnostic log before reporting a problem.", "Check that the note is editable and your account is connected."] });
    this.support.start();
    await this.loadSettings();
diagnosticStartupEnd = diagnostics?.start?.("startup.initialize") ?? (() => {});

    this.aiQueue = new AiRequestQueue(this.app, "Culebra", () => this.support.automaticWindowsEnabled());
    await showAccountWelcome(this, this.settings, () => this.saveSettings());

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
return diagnostics.guard("main.event_4", () => {
        const hasSelection = editor.getSelection().trim().length > 0;
        menu.addItem((item) => {
          item
            .setTitle(hasSelection ? "Culebra: Correct selected text" : "Culebra: Correct current note")
            .setIcon("spell-check")
            .onClick(() => {
return diagnostics.guard("main.control_5", () => {
const diagnosticAction12 = () => {

              void diagnostics.guard("main.background_6", () => (this.correctEditorText(editor)));

}; return diagnostics?.run ? diagnostics.run("control.18393.onClick", diagnosticAction12) : diagnosticAction12();

});
});
        });

});
}),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
return diagnostics.guard("main.event_7", () => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        menu.addItem((item) => {
          item
            .setTitle("Culebra: Correct this Markdown file")
            .setIcon("spell-check")
            .onClick(() => {
return diagnostics.guard("main.control_8", () => {
const diagnosticAction13 = () => {

              void diagnostics.guard("main.background_9", () => (this.correctFile(file)));

}; return diagnostics?.run ? diagnostics.run("control.18843.onClick", diagnosticAction13) : diagnosticAction13();

});
});
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

    registerSelectionAction(this, { name: "Culebra: Correct selected notes", icon: "spell-check", accepts: markdownFile, folders: true,
      run: async files => {
        new Notice(`Culebra: correcting ${files.length} note(s).`);
        let failed = 0;
        for (const file of files) { try { await this.correctFile(file); } catch { failed++; } }
        new Notice(`Culebra: selection finished; ${failed} failed.`);
      } });
    this.addSettingTab(new CulebraSettingTab(this.app, this));
    this.support.showWelcome();
    // Background balance sync; never blocks load, fails silently offline.
    void diagnostics.guard("main.background_10", () => (syncPurchasedCreditsFromConstance(this).then(() => retryPendingSpendEvents(this))));

} catch (diagnosticError11) { diagnostics?.failure?.("main.onload", diagnosticError11); throw diagnosticError11; } finally { diagnosticStartupEnd();  diagnostics?.legacy?.("info", "startup.finished"); diagnosticEnd11(); }
}

  async loadSettings() {
const diagnosticEnd14 = diagnostics?.start?.("main.loadSettings") ?? (() => {});
try {

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

} catch (diagnosticError14) { diagnostics?.failure?.("main.loadSettings", diagnosticError14); throw diagnosticError14; } finally { diagnosticEnd14(); }
}

  async saveSettings() {
const diagnosticEnd15 = diagnostics?.start?.("main.saveSettings") ?? (() => {});
try {

    await this.saveData(this.settings);

} catch (diagnosticError15) { diagnostics?.failure?.("main.saveSettings", diagnosticError15); throw diagnosticError15; } finally { diagnosticEnd15(); }
}

  private pollAfterCheckout(checkoutId?: string) {
    let attempts = 0;
    const intervalId = window.setInterval(() => {
return diagnostics.guard("main.timer_11", () => {
      attempts += 1;
      void diagnostics.guard("main.background_12", () => ((async () => {
const diagnosticEnd16 = diagnostics?.start?.("main.background.20331") ?? (() => {});
try {

        const settled = checkoutId
          ? await pollAuthenticatedCheckout({ state: this.settings, appId: CONSTANCE_APP_ID, installationId: this.settings.constanceDeviceId, persist: () => this.saveSettings(), syncBalance: () => syncPurchasedCreditsFromConstance(this) }, checkoutId).catch((rejectedError3) => { diagnostics.failure("main.rejected_4", rejectedError3); return (false); })
          : false;
        if (settled || !checkoutId) await syncPurchasedCreditsFromConstance(this);
        if (settled || attempts >= 6) window.clearInterval(intervalId);

} catch (diagnosticError16) { diagnostics?.failure?.("main.background.20331", diagnosticError16); throw diagnosticError16; } finally { diagnosticEnd16(); }
})()));

});
}, 15000);
  }

   /**
   * Charges the character-based cost after a valid correction is accepted.
   * The local free-character pool is used first, followed by the Constance
    * balance; any unverified balance or spend blocks the edit until the
    * server gives an authoritative result.
    */
  private async chargeOneCredit(textLength: number): Promise<boolean> {
const diagnosticEnd17 = diagnostics?.start?.("main.chargeOneCredit") ?? (() => {});
try {

    const cost = Math.max(1, Math.ceil(textLength));
    if (!this.settings.billingAccessToken || !this.settings.billingAccountLinked) {
      new Notice("Culebra: sign in or create an account in plugin settings before correcting text.");
      return false;
    }
    await retryPendingSpendEvents(this);
    if (this.settings.pendingSpendEvents.length > 0) {
      new Notice("Culebra: a previous charge is still being confirmed. No correction was applied.");
      return false;
    }
    const stableEventId = `consume_${generateEventId()}`;
    this.settings.pendingSpendEvents.push({ eventId: stableEventId, amount: cost });
    try {
      await this.saveSettings();
    } catch (error) {
diagnostics.failure("main.caught_13", error);
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      diagnostics?.legacy?.("error", "main.culebra_could_not_persist_pending_credit_spend");
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
      this.settings.pendingSpendEvents = this.settings.pendingSpendEvents.filter((item) => item.eventId !== stableEventId);
      await this.saveSettings();
      new Notice("Culebra: no character credits remain. Add credits in plugin settings.");
      return false;
    }

    diagnostics?.legacy?.("warn", "main.culebra_credit_spend_is_unknown_blocking_until_the_persisted_even");
    new Notice("Culebra: your account could not be verified. Retry after the connection is restored.");
    return false;

} catch (diagnosticError17) { diagnostics?.failure?.("main.chargeOneCredit", diagnosticError17); throw diagnosticError17; } finally { diagnosticEnd17(); }
}

   /** Correct the current selection, or the whole active note when no text is selected. */
   private async correctEditorText(editor: Editor) {
const diagnosticEnd18 = diagnostics?.start?.("main.correctEditorText") ?? (() => {});
try {

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
    if (!(await this.chargeOneCredit(originalText.length))) return;
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

} catch (diagnosticError18) { diagnostics?.failure?.("main.correctEditorText", diagnosticError18); throw diagnosticError18; } finally { diagnosticEnd18(); }
}

   /** Replace a Markdown file after optional Settings-based before/after review. */
   private async correctFile(file: TFile) {
const diagnosticEnd19 = diagnostics?.start?.("main.correctFile") ?? (() => {});
try {

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
    if (!(await this.chargeOneCredit(originalText.length))) return;
    if (await this.app.vault.read(file) !== originalText) {
      new Notice(`Culebra: ${file.name} changed during billing. Your edits were protected; contact support for a credit adjustment.`);
      return;
    }

    await this.app.vault.modify(file, correctedText);
    new Notice(`Culebra corrected ${file.name}.`);

} catch (diagnosticError19) { diagnostics?.failure?.("main.correctFile", diagnosticError19); throw diagnosticError19; } finally { diagnosticEnd19(); }
}

   /** Ask the configured provider for corrected text without mutating the vault. */
   private async correctText(originalText: string, targetLabel: string) {
const diagnosticEnd20 = diagnostics?.start?.("main.correctText") ?? (() => {});
try {

    if (!originalText.trim()) {
      new Notice("Culebra found no text to correct.");
      return null;
    }

    const queued = await this.aiQueue.enqueue(`Correction for ${targetLabel}`, originalText, async (report) => {
const diagnosticEnd21 = diagnostics?.start?.("main.background.26150") ?? (() => {});
try {

      report({ label: "Checking available credits", submittedText: originalText });
      const cost = Math.max(1, Math.ceil(originalText.length));
      if (!(await checkBillingBeforeAi(this, cost))) return null;

      let apiKey: string;
      try {
        report({ label: "Connecting to AI", submittedText: originalText });
        apiKey = await this.resolveApiKey();
      } catch (error) {
diagnostics.failure("main.caught_extra_4", error);
        diagnostics?.legacy?.("error", "main.culebra_failed_to_resolve_an_openrouter_api_key");
        new Notice("Culebra AI is temporarily unavailable. Check your connection and try again.");
        return null;
      }

      try {
        report({ label: "Processing text", submittedText: originalText });
        const response = await (diagnostics?.request?.("network.main.correctText", requestUrl, {
          url: OPENROUTER_CHAT_COMPLETIONS_URL,
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: [
              { role: "system", content: SPELL_CORRECT_INSTRUCTIONS },
              { role: "user", content: originalText },
            ],
          }),
          throw: false,
        }) ?? requestUrl({
          url: OPENROUTER_CHAT_COMPLETIONS_URL,
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: [
              { role: "system", content: SPELL_CORRECT_INSTRUCTIONS },
              { role: "user", content: originalText },
            ],
          }),
          throw: false,
        }));

        if (response.status < 200 || response.status >= 300) {
          diagnostics?.legacy?.("error", "main.culebra_ai_spell_correct_failed");
          new Notice("Culebra could not correct the text. Try again or copy the diagnostic log for support.");
          return null;
        }

        const correctedText = extractResponseText(response.json);
        if (!correctedText.trim()) {
          new Notice("Culebra received an empty response; no changes made.");
          return null;
        }
        return await (correctedText);
      } catch (error) {
diagnostics.failure("main.caught_extra_5", error);
        diagnostics?.legacy?.("error", "main.culebra_ai_spell_correct_failed");
        new Notice("Culebra could not correct the text. Try again or copy the diagnostic log for support.");
        return null;
      }

} catch (diagnosticError21) { diagnostics?.failure?.("main.background.26150", diagnosticError21); throw diagnosticError21; } finally { diagnosticEnd21(); }
});
    return await (queued.status === "completed" ? queued.value : null);

} catch (diagnosticError20) { diagnostics?.failure?.("main.correctText", diagnosticError20); throw diagnosticError20; } finally { diagnosticEnd20(); }
}
}

class CorrectionReviewModal extends Modal {
  private resolveResult!: (approved: boolean) => void;
  private settled = false;
  constructor(app: CulebraSpellCorrectPlugin["app"], private target: string, private before: string, private after: string) { super(app); }
  waitForResult(): Promise<boolean> { this.open(); return new Promise((resolve) => { this.resolveResult = resolve; }); }
  onOpen() {
return diagnostics.guard("main.onOpen_14", () => {
const diagnosticAction22 = () => {

    this.contentEl.createEl("h2", { text: `Review correction: ${this.target}` });
    const diff = this.contentEl.createEl("pre", { text: `BEFORE\n${this.before}\n\nAFTER\n${this.after}` });
    diff.style.whiteSpace = "pre-wrap";
    diff.style.maxHeight = "55vh";
    diff.style.overflow = "auto";
    const actions = this.contentEl.createDiv();
    actions.createEl("button", { text: "Cancel" }).onclick = diagnostics.wrap("main.dom_1", () => this.finish(false));
    actions.createEl("button", { text: "Apply correction", cls: "mod-cta" }).onclick = diagnostics.wrap("main.dom_2", () => this.finish(true));

}; return diagnostics?.run ? diagnostics.run("main.onOpen", diagnosticAction22) : diagnosticAction22();

});
}
  private finish(approved: boolean) { if (this.settled) return; this.settled = true; this.resolveResult(approved); this.close(); }
  onClose() {
return diagnostics.guard("main.onClose_15", () => {
const diagnosticAction23 = () => {
 if (!this.settled) { this.settled = true; this.resolveResult(false); } this.contentEl.empty();
}; return diagnostics?.run ? diagnostics.run("main.onClose", diagnosticAction23) : diagnosticAction23();

});
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
return diagnostics.guard("main.display_16", () => {
const diagnosticAction24 = () => {

    const { containerEl } = this;
    const diagnosticStage25 = diagnostics?.start?.("settings.render.clear") ?? (() => {});
containerEl.empty();
diagnosticStage25();

    const diagnosticStage26 = diagnostics?.start?.("settings.render.help") ?? (() => {});
this.plugin.support.addHelpSetting(containerEl);
diagnosticStage26();

this.plugin.support.addDebugSetting?.(containerEl);



    const diagnosticStage27 = diagnostics?.start?.("settings.render.stage_1") ?? (() => {});
containerEl.createEl("h2", { text: "Culebra AI Spell Correct" });
diagnosticStage27();


    const diagnosticStage28 = diagnostics?.start?.("settings.render.settings_mode") ?? (() => {});
new Setting(containerEl).setName("Settings mode").setDesc("Simple shows everyday controls. Advanced adds customization and troubleshooting.")
      .addDropdown(dropdown => dropdown.addOption("simple", "Simple").addOption("advanced", "Advanced — optional")
        .setValue(this.plugin.settings.settingsMode).onChange(async value => {
return diagnostics.guard("main.control_17", async () => {
const diagnosticEnd43 = diagnostics?.start?.("control.settings_mode.onChange") ?? (() => {});
try {

          this.plugin.settings.settingsMode = value === "advanced" ? "advanced" : "simple";
          await this.plugin.saveSettings(); this.display();

} catch (diagnosticError43) { diagnostics?.failure?.("control.settings_mode.onChange", diagnosticError43); throw diagnosticError43; } finally { diagnosticEnd43(); }

});
}));
diagnosticStage28();

    const diagnosticStage29 = diagnostics?.start?.("settings.render.stage_2") ?? (() => {});
containerEl.createEl("h3", { text: "Getting started" });
diagnosticStage29();

    const diagnosticStage30 = diagnostics?.start?.("settings.render.stage_3") ?? (() => {});
containerEl.createEl("p", {
      text:
        "Select text in a note, or leave the selection empty to correct the current note. Then choose Culebra from the editor menu, command palette, or a Markdown file's context menu. Culebra applies the correction immediately and supports Undo.",
    });
diagnosticStage30();


    const diagnosticStage31 = diagnostics?.start?.("settings.render.review_before_applying") ?? (() => {});
new Setting(containerEl)
      .setName("Review before applying")
      .setDesc("Review the original and corrected text before applying changes. Off by default.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.reviewBeforeApply).onChange(async (value) => {
return diagnostics.guard("main.control_18", async () => {
const diagnosticEnd44 = diagnostics?.start?.("control.review_before_applying.onChange") ?? (() => {});
try {
 this.plugin.settings.reviewBeforeApply = value; await this.plugin.saveSettings();
} catch (diagnosticError44) { diagnostics?.failure?.("control.review_before_applying.onChange", diagnosticError44); throw diagnosticError44; } finally { diagnosticEnd44(); }

});
}));
diagnosticStage31();

    const diagnosticStage32 = diagnostics?.start?.("settings.render.stage_4") ?? (() => {});
containerEl.createEl("p", {
      text:
        "Correction requests send only the text you explicitly choose to OpenRouter. Use Undo if a correction is not wanted.",
    });
diagnosticStage32();

    const diagnosticStage33 = diagnostics?.start?.("settings.render.ai_model") ?? (() => {});
if (this.plugin.settings.settingsMode === "advanced") {
      new Setting(containerEl).setName("AI model").setDesc("The AI model is selected automatically.");
      new Setting(containerEl).setName("AI request queue").setDesc("Inspect progress or remove waiting corrections; the active request continues.")
        .addButton(button => button.setButtonText("Show queue").onClick(() => {
return diagnostics.guard("main.control_19", () => { const diagnosticAction45 = () => (this.plugin.aiQueue.open()); return diagnostics?.run ? diagnostics.run("control.ai_request_queue.onClick", diagnosticAction45) : diagnosticAction45();
});
}));
      this.plugin.support.addDiagnosticsSetting(containerEl);
    }
diagnosticStage33();


    const diagnosticStage34 = diagnostics?.start?.("settings.render.stage_5") ?? (() => {});
containerEl.createEl("h3", { text: "Credits & billing" });
diagnosticStage34();

    const diagnosticStage35 = diagnostics?.start?.("settings.render.stage_6") ?? (() => {});
containerEl.createEl("p", {
      text:
        "Each corrected input character uses one credit. Each account includes 2,000 free characters on the account, shared across installations. Purchase more credits below.",
    });
diagnosticStage35();


    const diagnosticStage36 = diagnostics?.start?.("settings.render.stage_7") ?? (() => {});
this.creditsSummaryEl = containerEl.createEl("p", { cls: "culebra-credits-summary" });
diagnosticStage36();

    const diagnosticStage37 = diagnostics?.start?.("settings.render.stage_8") ?? (() => {});
this.plugin.refreshBillingCredits = () => this.renderCreditsSummary();
diagnosticStage37();

    const diagnosticStage38 = diagnostics?.start?.("settings.render.stage_9") ?? (() => {});
this.renderCreditsSummary();
diagnosticStage38();


    const diagnosticStage39 = diagnostics?.start?.("settings.render.account") ?? (() => {});
addBillingAccountSettings(containerEl, { state: this.plugin.settings, appId: CONSTANCE_APP_ID, installationId: this.plugin.settings.constanceDeviceId, appVersion: this.plugin.manifest.version, persist: () => this.plugin.saveSettings(), syncBalance: () => syncPurchasedCreditsFromConstance(this.plugin), refresh: () => this.display() });
diagnosticStage39();


    const diagnosticStage40 = diagnostics?.start?.("settings.render.stage_10") ?? (() => {});
addLivePacks(containerEl, { state: this.plugin.settings, appId: CONSTANCE_APP_ID, installationId: this.plugin.settings.constanceDeviceId, persist: () => this.plugin.saveSettings(), syncBalance: () => syncPurchasedCreditsFromConstance(this.plugin) });
diagnosticStage40();


    const diagnosticStage41 = diagnostics?.start?.("settings.render.refresh_balance") ?? (() => {});
new Setting(containerEl)
      .setName("Refresh balance")
      .setDesc("Update your free and purchased credit balance.")
      .addButton((button) =>
        button.setButtonText("Refresh balance").onClick(async () => {
return diagnostics.guard("main.control_20", async () => {
const diagnosticEnd46 = diagnostics?.start?.("control.refresh_balance.onClick") ?? (() => {});
try {

          button.setDisabled(true);
          button.setButtonText("Refreshing...");
          try { await syncPurchasedCreditsFromConstance(this.plugin, true); this.renderCreditsSummary(); }
          catch (caughtError21) {
diagnostics.failure("main.caught_22", caughtError21); new Notice("Could not refresh balance. Please try again."); }
          finally { button.setDisabled(false); button.setButtonText("Refresh balance"); }

} catch (diagnosticError46) { diagnostics?.failure?.("control.refresh_balance.onClick", diagnosticError46); throw diagnosticError46; } finally { diagnosticEnd46(); }

});
}),
      );
diagnosticStage41();


    // Sync on open so the summary reflects a purchase made since last time
    // Obsidian was open, without requiring a manual refresh click.
    const diagnosticStage42 = diagnostics?.start?.("settings.render.stage_11") ?? (() => {});
void diagnostics.guard("main.background_23", () => (syncPurchasedCreditsFromConstance(this.plugin).then(() => this.renderCreditsSummary()).catch((rejectedError5) => {
diagnostics.failure("main.rejected_6", rejectedError5);})));
diagnosticStage42();


}; return diagnostics?.run ? diagnostics.run("settings.open", diagnosticAction24) : diagnosticAction24();

});
}

  private renderCreditsSummary() {
const diagnosticAction47 = () => {

    if (!this.creditsSummaryEl) {
      return;
    }
    const { freeCredits, purchasedCredits } = this.plugin.settings;
    const totalChars = freeCredits + purchasedCredits;
    this.creditsSummaryEl.setText(
      `Characters remaining: ${totalChars.toLocaleString()} (${freeCredits.toLocaleString()} free + ${purchasedCredits.toLocaleString()} purchased)`,
    );

}; return diagnostics?.run ? diagnostics.run("main.renderCreditsSummary", diagnosticAction47) : diagnosticAction47();
}

  hide(): void { const end = diagnostics?.start?.("settings.close") ?? (() => {}); try { super.hide(); } finally { end(); } }
}
