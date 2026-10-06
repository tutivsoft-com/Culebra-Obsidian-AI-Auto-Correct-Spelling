import { diagnostics } from "./diagnostics";
import { Notice, requestUrl } from "obsidian";

interface PendingCheckout { key?: string; plan?: string; email?: string; checkoutId?: string; idempotency_key?: string; price_id?: string; checkout_id?: string; owner?: string; plan_code?: string }
interface CheckoutState {
  billingEmail: string; billingAccessToken: string; billingRefreshToken: string; billingAccountLinked: boolean;
  pendingAccountCheckout?: PendingCheckout | null;
  pendingPriceCheckout?: PendingCheckout; pendingPaddleCheckout?: PendingCheckout; previewPendingCheckout?: PendingCheckout;
  [key: string]: any;
}
export interface CheckoutHost {
  state: CheckoutState; appId: string; installationId: string;
  persist(): Promise<void>; syncBalance(): Promise<void>; refreshSession(): Promise<boolean>;
}
const running = new WeakMap<object, Promise<void>>();
const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();

async function send(host: CheckoutHost, path: string, method: "GET" | "POST", body?: unknown, key?: string): Promise<any> {
const diagnosticEnd1 = diagnostics?.start?.("billing-checkout.send") ?? (() => {});
try {

  const request = () => (diagnostics?.request?.("network.billing-checkout.send", requestUrl, { url: `https://app.tutivsoft.com/api/v1/billing/${path}`, method, throw: false,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${host.state.billingAccessToken}`, ...(key ? { "Idempotency-Key": key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) }) ?? requestUrl({ url: `https://app.tutivsoft.com/api/v1/billing/${path}`, method, throw: false,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${host.state.billingAccessToken}`, ...(key ? { "Idempotency-Key": key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) }));
  let response = await request();
  if (response.status === 401 && await host.refreshSession()) response = await request();
  return await (response);

} catch (diagnosticError1) { diagnostics?.failure?.("billing-checkout.send", diagnosticError1); throw diagnosticError1; } finally { diagnosticEnd1(); }
}

export function resumeAccountCheckout(host: CheckoutHost): void {
  const entry = findPending(host.state);
  if (!entry || !host.state.billingAccountLinked || pendingOwner(entry.pending) !== host.state.billingEmail || timers.has(host.state)) return;
  const timer = setTimeout(() => {
return diagnostics.guard("billing-checkout.timer_1", () => {
    timers.delete(host.state);
    if (running.has(host.state)) { resumeAccountCheckout(host); return; }
    const operation = recover(host);
    running.set(host.state, operation);
    void diagnostics.guard("billing-checkout.background_2", () => (operation.catch((rejectedError1) => { diagnostics.failure("billing-checkout.rejected_2", rejectedError1); return (undefined); }).finally(() => { running.delete(host.state); resumeAccountCheckout(host); })));

});
}, 15000);
  timers.set(host.state, timer);
  // Node tests should not be kept alive by a background poll.
  (timer as any).unref?.();
}

function findPending(state: CheckoutState): { key: string; pending: PendingCheckout } | undefined {
  for (const key of ["pendingAccountCheckout", "pendingPriceCheckout", "pendingPaddleCheckout", "previewPendingCheckout"]) {
    const pending = state[key] as PendingCheckout | null | undefined;
    if (pending && typeof pending === "object") return { key, pending };
  }
}

function pendingOwner(pending: PendingCheckout): string | undefined { return pending.email || pending.owner; }

async function recover(host: CheckoutHost): Promise<void> {
const diagnosticEnd2 = diagnostics?.start?.("billing-checkout.recover") ?? (() => {});
try {

  const entry = findPending(host.state);
  if (!entry) return;
  const { key, pending } = entry;
  if (!host.state.billingAccountLinked || pendingOwner(pending) !== host.state.billingEmail) return;
  const current = () => host.state[key] === pending && pendingOwner(pending) === host.state.billingEmail;
  let checkoutId = pending.checkoutId || pending.checkout_id;
  if (!checkoutId) {
    const priceId = pending.price_id;
    const idempotencyKey = pending.key || pending.idempotency_key;
    const body = priceId
      ? { app_id: host.appId, installation_id: host.installationId, price_id: priceId, quantity: 1 }
      : { app_id: host.appId, installation_id: host.installationId, plan_code: pending.plan || pending.plan_code, quantity: 1 };
    const response = await send(host, priceId ? "checkout-price" : "checkout", "POST", body, idempotencyKey);
    if (!current()) return;
    if (response.status < 200 || response.status >= 300 || !response.json?.data?.checkout_id) return;
    checkoutId = String(response.json.data.checkout_id);
    if ("checkout_id" in pending || key !== "pendingAccountCheckout") pending.checkout_id = checkoutId;
    else pending.checkoutId = checkoutId;
    await host.persist();
  }
  const response = await send(host, `checkouts/${encodeURIComponent(checkoutId!)}`, "GET");
  if (!current()) return;
  if (response.status < 200 || response.status >= 300) return;
  const data = response.json?.data;
  if (data?.settled || ["completed", "fulfilled", "failed", "canceled", "cancelled", "expired", "voided", "rejected"].includes(data?.status)) {
    await host.syncBalance();
    if (!current()) return;
    host.state[key] = key === "pendingAccountCheckout" ? null : undefined;
    await host.persist();
  }

} catch (diagnosticError2) { diagnostics?.failure?.("billing-checkout.recover", diagnosticError2); throw diagnosticError2; } finally { diagnosticEnd2(); }
}

export async function openAccountCheckout(host: CheckoutHost, plan: string): Promise<void> {
const diagnosticEnd3 = diagnostics?.start?.("billing-checkout.openAccountCheckout") ?? (() => {});
try {

  if (running.has(host.state)) return await (running.get(host.state));
  const operation = (async () => {
const diagnosticEnd4 = diagnostics?.start?.("billing-checkout.background.4693") ?? (() => {});
try {

    if (!host.state.billingAccountLinked) { new Notice("Connect your account first."); return; }
    const saved = host.state.pendingAccountCheckout;
    if (saved && (saved.plan !== plan || saved.email !== host.state.billingEmail)) {
      new Notice("A purchase is pending. Its status will refresh automatically before you can start another.");
      resumeAccountCheckout(host); return;
    }
    const pending = saved || { key: `checkout_${globalThis.crypto.randomUUID()}`, plan, email: host.state.billingEmail };
    host.state.pendingAccountCheckout = pending;
    try {
      await host.persist();
      const response = await send(host, "checkout", "POST", { app_id: host.appId, installation_id: host.installationId, plan_code: plan, quantity: 1 }, pending.key);
      if (host.state.pendingAccountCheckout !== pending || pending.email !== host.state.billingEmail) return;
      if (response.status < 200 || response.status >= 300 || !response.json?.data?.checkout_url || !response.json?.data?.checkout_id) {
        new Notice("Checkout could not be confirmed. Retry the same purchase to recover it safely."); return;
      }
      pending.checkoutId = String(response.json.data.checkout_id);
      await host.persist();
      window.open(response.json.data.checkout_url, "_blank", "noopener");
      new Notice("Complete payment in your browser. Your balance will update automatically.");
    } catch (caughtError3) {
diagnostics.failure("billing-checkout.caught_4", caughtError3); new Notice("Checkout could not be confirmed. Retry the same purchase to recover it safely."); }
    finally { resumeAccountCheckout(host); }

} catch (diagnosticError4) { diagnostics?.failure?.("billing-checkout.background.4693", diagnosticError4); throw diagnosticError4; } finally { diagnosticEnd4(); }
})();
  running.set(host.state, operation);
  try { await operation; } finally { running.delete(host.state); }

} catch (diagnosticError3) { diagnostics?.failure?.("billing-checkout.openAccountCheckout", diagnosticError3); throw diagnosticError3; } finally { diagnosticEnd3(); }
}
