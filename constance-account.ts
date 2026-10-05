import { renderAccountGuidance } from "./account-guidance";
import { resumeAccountCheckout } from "./billing-checkout";
import { Notice, Setting, requestUrl, RequestUrlParam } from "obsidian";

export const CONSTANCE_ACCOUNT_BASE_URL = "https://app.tutivsoft.com";

export interface ConstanceAccountState {
  billingEmail: string;
  billingAccessToken: string;
  billingRefreshToken: string;
  billingAccessExpiresAt: number;
  billingAccountLinked: boolean;
  billingRegistrationPending?: boolean;
}

export interface ConstanceAccountAdapter {
  state: ConstanceAccountState;
  appId: string;
  installationId: string;
  appVersion?: string;
  persist(): Promise<void>;
  syncBalance(): Promise<void>;
  refresh?(): void;
}

interface AuthenticationResult {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  verificationRequired?: boolean;
}

export type FreeUsageResult =
  | { kind: "ok"; remaining: number }
  | { kind: "insufficient" }
  | { kind: "auth-required" }
  | { kind: "error" };

export type AccountSpendResult =
  | { kind: "ok"; balance: number }
  | { kind: "insufficient" }
  | { kind: "auth-required" }
  | { kind: "error" };

export type AuthenticatedCheckoutResult =
  | { kind: "ok"; checkoutUrl: string; checkoutId?: string }
  | { kind: "fallback" }
  | { kind: "auth-required" };

class ConstanceAccountError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ConstanceAccountError";
    this.status = status;
  }
}

function errorDetail(response: { json?: any; text?: string }, fallback: string): string {
  const payload = response.json?.data || response.json;
  const detail = payload?.detail;
  const code = detail?.code || payload?.code;
  if (code === "invalid_credentials") return "The email or password is incorrect. Use Forgot password? to reset it.";
  if (code === "email_verification_required") return "Email not verified. Click the link in your email, then Connect again.";
  return String(detail?.message || (typeof detail === "string" ? detail : "") || payload?.message || fallback);
}

async function linkAuthenticatedInstallation(adapter: ConstanceAccountAdapter, token: string): Promise<void> {
  try {
    await linkInstallation(adapter, token);
  } catch (error) {
    if (error instanceof ConstanceAccountError && error.status === 401) {
      adapter.state.billingAccessToken = "";
      adapter.state.billingRefreshToken = "";
      adapter.state.billingAccountLinked = false;
      await adapter.persist();
    }
    throw error;
  }
}

async function authenticate(
  mode: "login" | "register" | "connect",
  email: string,
  password: string,
  installationId: string,
): Promise<AuthenticationResult> {
  const body = mode !== "login"
    ? { email, password, external_customer_id: installationId }
    : { email, password };
  const response = await requestUrl({
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/${mode}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    throw: false,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ConstanceAccountError(errorDetail(response, `Billing ${mode} failed (HTTP ${response.status})`), response.status);
  }
  if (response.json?.verification_required === true) return { verificationRequired: true };
  const token = String(response.json?.access_token || "");
  const refreshToken = String(response.json?.refresh_token || "");
  if (token && refreshToken) return { accessToken: token, refreshToken, expiresIn: Number(response.json?.expires_in) || 900 };
  throw new Error("Constance did not return an account token.");
}

async function linkInstallation(adapter: ConstanceAccountAdapter, token: string): Promise<void> {
  const response = await requestUrl({
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/installations/link`,
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      app_id: adapter.appId,
      installation_id: adapter.installationId,
      legacy_external_customer_id: adapter.installationId,
      platform: "obsidian",
      app_version: adapter.appVersion || undefined,
    }),
    throw: false,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ConstanceAccountError(errorDetail(response, `Installation link failed (HTTP ${response.status})`), response.status);
  }
}

export async function signInBillingAccount(
  adapter: ConstanceAccountAdapter,
  password: string,
  mode: "login" | "register" | "connect",
): Promise<void> {
  const email = adapter.state.billingEmail.trim().toLowerCase();
  const journalState = adapter.state as ConstanceAccountState & Record<string, any>;
  const owner = String(journalState.pendingBillingOwnerEmail || "").toLowerCase();
  if (owner && owner !== email) throw new Error(`An unfinished billing request belongs to ${owner}. Connect that account to recover it first.`);

  if (!email || !email.includes("@")) throw new Error("Enter a valid billing email.");
  if (Array.from(password).length < 8 || Array.from(password).length > 128) throw new Error("Password must be between 8 and 128 characters.");
  if (!adapter.installationId) throw new Error("The plugin installation ID is not ready.");
  const result = await authenticate(mode, email, password, adapter.installationId);
  if (!result.accessToken) {
    clearBillingSession(adapter.state);
    adapter.state.billingEmail = email;
    adapter.state.billingAccountLinked = false;
    adapter.state.billingRegistrationPending = true;
    await adapter.persist();
    throw new Error("Registered but not logged in. Check your email, click the confirmation link, then sign in here.");
  }
  await completeBillingSignIn(adapter, email, result);
}

async function completeBillingSignIn(adapter: ConstanceAccountAdapter, email: string, session: AuthenticationResult): Promise<void> {
  if (!session.accessToken || !session.refreshToken) throw new Error("Constance did not return a complete account session.");
  adapter.state.billingEmail = email;
  adapter.state.billingAccessToken = session.accessToken;
  adapter.state.billingRefreshToken = session.refreshToken;
  adapter.state.billingAccessExpiresAt = Date.now() + (session.expiresIn || 900) * 1000;
  adapter.state.billingAccountLinked = false;
  adapter.state.billingRegistrationPending = false;
  await adapter.persist();
  await linkAuthenticatedInstallation(adapter, session.accessToken);
  adapter.state.billingAccountLinked = true;
  await adapter.persist();
  await adapter.syncBalance();
}

export async function verifyBillingAccount(adapter: ConstanceAccountAdapter, verificationToken: string): Promise<void> {
  const token = verificationToken.trim();
  if (!token) throw new Error("Enter the verification token from your billing email.");
  const response = await requestUrl({
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/register/verify`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    throw: false,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new ConstanceAccountError(errorDetail(response, `Billing account verification failed (HTTP ${response.status})`), response.status);
  }
  const accessToken = String(response.json?.access_token || "");
  if (!accessToken) throw new Error("Constance did not return an account token after verification.");
  await completeBillingSignIn(adapter, adapter.state.billingEmail.trim().toLowerCase(), { accessToken, refreshToken: String(response.json?.refresh_token || ""), expiresIn: Number(response.json?.expires_in) || 900 });
}

export function clearBillingSession(state: ConstanceAccountState): void {
  state.billingAccessToken = "";
  state.billingRefreshToken = "";
  state.billingAccessExpiresAt = 0;
  state.billingAccountLinked = false;
}

let refreshInFlight: Promise<boolean> | null = null;
export async function refreshBillingSession(state: ConstanceAccountState, persist: () => Promise<void>): Promise<boolean> {
  if (!state.billingRefreshToken) return false;
  if (refreshInFlight) return refreshInFlight;
  const originalToken = state.billingRefreshToken;
  refreshInFlight = (async () => {
    let response;
    try {
      response = await requestUrl({ url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/refresh`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: originalToken }), throw: false });
    } catch { return false; }
    if (state.billingRefreshToken !== originalToken) return false;
    if (response.status === 401 || response.status === 403) { clearBillingSession(state); await persist(); return false; }
    if (response.status < 200 || response.status >= 300) return false;
    const access = String(response.json?.access_token || "");
    const refresh = String(response.json?.refresh_token || "");
    if (!access || !refresh) { clearBillingSession(state); await persist(); return false; }
    state.billingAccessToken = access;
    state.billingRefreshToken = refresh;
    state.billingAccessExpiresAt = Date.now() + (Number(response.json?.expires_in) || 900) * 1000;
    await persist();
    return true;
  })();
  try { return await refreshInFlight; } finally { refreshInFlight = null; }
}

export async function requestAuthenticatedBilling(state: ConstanceAccountState, persist: () => Promise<void>, options: RequestUrlParam): Promise<any> {
  if (state.billingRefreshToken && (!state.billingAccessToken || Date.now() >= state.billingAccessExpiresAt - 60_000)) {
    if (!await refreshBillingSession(state, persist) && state.billingRefreshToken) return { status: 503 };
  }
  const send = () => requestUrl({ ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${state.billingAccessToken}` }, throw: false });
  if (!state.billingAccessToken) return { status: 401 };
  let response = await send();
  if (response.status === 401 && state.billingRefreshToken) {
    if (await refreshBillingSession(state, persist)) response = await send();
    else if (state.billingRefreshToken) return { status: 503 };
  }
  return response;
}

export async function createAuthenticatedCheckout(
  adapter: ConstanceAccountAdapter,
  planCode: string,
  idempotencyKey: string,
): Promise<AuthenticatedCheckoutResult> {
  if (!adapter.state.billingAccessToken || !adapter.state.billingAccountLinked) return { kind: "auth-required" };
  const response = await requestAuthenticatedBilling(adapter.state, adapter.persist, {
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/checkout`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      app_id: adapter.appId,
      plan_code: planCode,
      installation_id: adapter.installationId,
      quantity: 1,
      coupon_code: null,
    }),
    throw: false,
  });
  if (response.status === 401 || response.status === 403) return { kind: "auth-required" };
  if (response.status < 200 || response.status >= 300) return { kind: "fallback" };
  const data = response.json?.data;
  const checkoutUrl = typeof data?.checkout_url === "string" ? data.checkout_url : "";
  return checkoutUrl
    ? { kind: "ok", checkoutUrl, checkoutId: data?.checkout_id ? String(data.checkout_id) : undefined }
    : { kind: "fallback" };
}

export async function pollAuthenticatedCheckout(adapter: ConstanceAccountAdapter, checkoutId: string): Promise<boolean> {
  if (!adapter.state.billingAccessToken || !adapter.state.billingAccountLinked) return false;
  const response = await requestAuthenticatedBilling(adapter.state, adapter.persist, {
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/checkouts/${encodeURIComponent(checkoutId)}`,
    method: "GET",
    throw: false,
  });
  return response.status >= 200 && response.status < 300 && response.json?.data?.settled === true;
}

export async function validateBillingSession(adapter: ConstanceAccountAdapter): Promise<boolean> {
  resumeAccountCheckout({ ...adapter, refreshSession: () => refreshBillingSession(adapter.state, adapter.persist) });

  const token = adapter.state.billingAccessToken;
  if (!token || !adapter.state.billingAccountLinked || !adapter.installationId) return false;
  const query = new URLSearchParams({ app_id: adapter.appId, installation_id: adapter.installationId });
  const response = await requestAuthenticatedBilling(adapter.state, adapter.persist, {
    url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/entitlements/me?${query.toString()}`,
    method: "GET",
    throw: false,
  });
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    clearBillingSession(adapter.state);
    await adapter.persist();
    return false;
  }
  return response.status >= 200 && response.status < 300;
}

export async function claimAccountFreeUsage(
  state: ConstanceAccountState,
  persist: () => Promise<void>,
  appId: string,
  installationId: string,
  eventId: string,
  amount: number,
): Promise<FreeUsageResult> {
  if (!state.billingAccessToken || !state.billingAccountLinked) return { kind: "auth-required" };
  try {
    const response = await requestAuthenticatedBilling(state, persist, {
      url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/free-usage/claim`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, installation_id: installationId, event_id: eventId, amount }),
      throw: false,
    });
    if (response.status === 402) return { kind: "insufficient" };
    if (response.status === 401 || response.status === 403 || response.status === 404) return { kind: "auth-required" };
    if (response.status < 200 || response.status >= 300) return { kind: "error" };
    const remaining = Math.max(0, Number(response.json?.data?.remaining) || 0);
    new Notice(`Credit balance before this task: ${(remaining + amount).toLocaleString()} free credits.`);
    new Notice(`Task used ${amount.toLocaleString()} credits. Balance remaining: ${remaining.toLocaleString()} free credits.`);
    return { kind: "ok", remaining };
  } catch (error) {
    console.error("Constance account free-usage claim failed", error);
    return { kind: "error" };
  }
}

/** Spend paid credits only after Constance verifies the signed-in account owns this installation. */
export async function spendAccountCredits(
  state: ConstanceAccountState,
  persist: () => Promise<void>,
  appId: string,
  installationId: string,
  eventId: string,
  amount: number,
): Promise<AccountSpendResult> {
  if (!state.billingAccessToken || !state.billingAccountLinked) return { kind: "auth-required" };
  try {
    const response = await requestAuthenticatedBilling(state, persist, {
      url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/billing/credits/spend`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, installation_id: installationId, event_id: eventId, amount }),
      throw: false,
    });
    if (response.status === 402) return { kind: "insufficient" };
    if (response.status === 401 || response.status === 403 || response.status === 404) return { kind: "auth-required" };
    if (response.status < 200 || response.status >= 300) return { kind: "error" };
    const balance = Number(response.json?.data?.credits?.balance);
    if (!Number.isFinite(balance)) return { kind: "error" };
    const remaining = Math.max(0, balance);
    new Notice(`Credit balance before this task: ${(remaining + amount).toLocaleString()} purchased credits.`);
    new Notice(`Task used ${amount.toLocaleString()} credits. Balance remaining: ${remaining.toLocaleString()} purchased credits.`);
    return { kind: "ok", balance: remaining };
  } catch (error) {
    console.error("Constance authenticated credit spend failed", error);
    return { kind: "error" };
  }
}

export function addBillingAccountSettings(containerEl: HTMLElement, adapter: ConstanceAccountAdapter): void {
  resumeAccountCheckout({ ...adapter, refreshSession: () => refreshBillingSession(adapter.state, adapter.persist) });

  let password = "";
  const section = containerEl.createDiv({ cls: "constance-account-billing-section" });

  renderAccountGuidance(section, { appId: adapter.appId, connected: adapter.state.billingAccountLinked && Boolean(adapter.state.billingAccessToken || adapter.state.billingRefreshToken), defaultAllowance: 2000, unit: "characters", workflow: "Select text or open a Markdown note, then run a Culebra correction command. You can undo the changes." });
  section.createEl("h3", { text: "Account and billing" });
  const state = adapter.state as ConstanceAccountState & Record<string, unknown>;
  const numericBalances = Object.entries(state)
    .filter(([key, value]) => /(?:credit|balance|remaining)/i.test(key) && typeof value === "number")
    .map(([key, value]) => `${key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}: ${Number(value).toLocaleString()}`);
  const accountStatus = adapter.state.billingAccountLinked
    ? `Signed in as ${adapter.state.billingEmail || "your account"}`
    : state.billingRegistrationPending
      ? `Registered as ${adapter.state.billingEmail} but not signed in. Check your email, click the confirmation link, then sign in here.`
      : "Not signed in.";
  section.createEl("p", {
    cls: "constance-account-status",
    text: numericBalances.length ? `${accountStatus} Balance — ${numericBalances.join("; ")}` : accountStatus,
  });

  if (!adapter.state.billingAccountLinked) {
  new Setting(section)
    .setName("Email")
    .setDesc("Used to register, sign in, restore purchases, and open checkout.")
    .addText((text) => text.setPlaceholder("you@example.com").setValue(adapter.state.billingEmail).setDisabled(adapter.state.billingAccountLinked).onChange(async (value) => {
      const journalState = adapter.state as ConstanceAccountState & Record<string, any>;
      const hasPending = Object.entries(journalState).some(([key, value]) => /^pending/i.test(key) && key !== "pendingBillingOwnerEmail" && !!value && (Array.isArray(value) ? value.length > 0 : typeof value === "object" ? Object.keys(value).length > 0 : true));
      if (hasPending && !journalState.pendingBillingOwnerEmail) journalState.pendingBillingOwnerEmail = adapter.state.billingEmail;
      if (!hasPending) journalState.pendingBillingOwnerEmail = undefined;
      adapter.state.billingEmail = value.trim();
      await adapter.persist();
    }));
  new Setting(section)
    .setName("Password")
    .setDesc("Used only for this request. The plugin never saves your password.")
    .addText((text) => {
      text.inputEl.type = "password";
      text.inputEl.maxLength = 256;
      text.setPlaceholder("8 to 128 characters").onChange((value) => { password = value; });
    });
  }
  new Setting(section)
    .setName("Account")
    .setDesc(accountStatus)
    .addButton((button) => { if (adapter.state.billingAccountLinked) { button.buttonEl.remove(); return; } button.setButtonText("Connect").setDisabled(adapter.state.billingAccountLinked).onClick(async () => {
      button.setDisabled(true);
      try {
        await signInBillingAccount(adapter, password, "connect");
        password = "";
        new Notice(adapter.state.billingRegistrationPending ? "Check your email and follow the verification link, then Connect again." : `Connected as ${adapter.state.billingEmail}.`);
        adapter.refresh?.();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "Connection failed. Please try again.");
        adapter.refresh?.();
      } finally { button.setDisabled(adapter.state.billingAccountLinked); }
    }); })
    .addButton((button) => button.setButtonText("Sign out").setDisabled(!adapter.state.billingAccessToken).onClick(async () => {
      const refreshToken = adapter.state.billingRefreshToken;
      clearBillingSession(adapter.state);
      state.billingRegistrationPending = false;
      await adapter.persist();
      if (refreshToken) void requestUrl({ url: `${CONSTANCE_ACCOUNT_BASE_URL}/api/v1/auth/logout`, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }), throw: false }).catch(() => {});
      new Notice("Signed out.");
      adapter.refresh?.();
    }));

  if (!adapter.state.billingAccountLinked) new Setting(section).setName("Forgot password?").setDesc("Reset your billing account password on Constance.")
    .addButton((button) => button.setButtonText("Open reset page").onClick(() => window.open(`${CONSTANCE_ACCOUNT_BASE_URL}/password-reset`, "_blank")));

  const firstHeading = containerEl.querySelector(":scope > h1, :scope > h2");
  if (firstHeading?.nextSibling) containerEl.insertBefore(section, firstHeading.nextSibling);
  else containerEl.prepend(section);
  queueMicrotask(() => {
    const candidates = Array.from(containerEl.querySelectorAll(":scope > .setting-item"));
    for (const item of candidates) {
      const label = item.textContent || "";
      if (/buy|checkout|refresh balance|sync balance|credit pack/i.test(label)) section.appendChild(item);
    }
    for (const summary of Array.from(containerEl.querySelectorAll('[class*="credit"][class*="summary"], [class*="balance"][class*="summary"]'))) {
      if (!section.contains(summary)) section.appendChild(summary);
    }
  });
}

/** A single welcome with an actionable setup link; account guidance stays in settings until connected. */
export async function showAccountWelcome(plugin: import("obsidian").Plugin, state: ConstanceAccountState, persist: () => Promise<void>): Promise<void> {
  const openSetup = (): void => {
    const settings = (plugin.app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
    settings.open(); settings.openTabById(plugin.manifest.id);
  };
  plugin.addCommand({ id: "open-account-setup", name: "Get started: connect your account", callback: openSetup });
  const saved = state as ConstanceAccountState & { accountWelcomeSeen?: boolean };
  if (state.billingAccountLinked || saved.accountWelcomeSeen) return;
  saved.accountWelcomeSeen = true;
  await persist();
  plugin.app.workspace.onLayoutReady(() => {
    if (state.billingAccountLinked) return;
    const fragment = document.createDocumentFragment();
    fragment.append("Culebra" + ": create an account or sign in, then connect to check your free allowance (default: 2,000 AI characters once per account). ");
    const button = document.createElement("button");
    button.textContent = "Open account setup";
    button.addEventListener("click", openSetup);
    fragment.append(button);
    new Notice(fragment, 12000);
  });
}
