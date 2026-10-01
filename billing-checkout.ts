import { Notice, requestUrl } from "obsidian";

interface PendingCheckout { key: string; plan: string; email: string; checkoutId?: string }
interface CheckoutState {
  billingEmail: string; billingAccessToken: string; billingRefreshToken: string; billingAccountLinked: boolean;
  pendingAccountCheckout?: PendingCheckout | null;
}
export interface CheckoutHost {
  state: CheckoutState; appId: string; installationId: string;
  persist(): Promise<void>; syncBalance(): Promise<void>; refreshSession(): Promise<boolean>;
}
const running = new WeakMap<object, Promise<void>>();
const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();

async function send(host: CheckoutHost, path: string, method: "GET" | "POST", body?: unknown, key?: string): Promise<any> {
  const request = () => requestUrl({ url: `https://app.tutivsoft.com/api/v1/billing/${path}`, method, throw: false,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${host.state.billingAccessToken}`, ...(key ? { "Idempotency-Key": key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  let response = await request();
  if (response.status === 401 && await host.refreshSession()) response = await request();
  return response;
}

export function resumeAccountCheckout(host: CheckoutHost): void {
  if (!host.state.pendingAccountCheckout || !host.state.billingAccountLinked || host.state.pendingAccountCheckout.email !== host.state.billingEmail || timers.has(host.state)) return;
  const timer = setTimeout(() => {
    timers.delete(host.state);
    if (running.has(host.state)) { resumeAccountCheckout(host); return; }
    const operation = recover(host);
    running.set(host.state, operation);
    void operation.catch(() => undefined).finally(() => { running.delete(host.state); resumeAccountCheckout(host); });
  }, 15000);
  timers.set(host.state, timer);
  // Node tests should not be kept alive by a background poll.
  (timer as any).unref?.();
}

async function recover(host: CheckoutHost): Promise<void> {
  const pending = host.state.pendingAccountCheckout;
  if (!pending || !host.state.billingAccountLinked || pending.email !== host.state.billingEmail) return;
  if (!pending.checkoutId) {
    const response = await send(host, "checkout", "POST", { app_id: host.appId, installation_id: host.installationId, plan_code: pending.plan, quantity: 1 }, pending.key);
    if (host.state.pendingAccountCheckout !== pending || pending.email !== host.state.billingEmail) return;
    if (response.status < 200 || response.status >= 300 || !response.json?.data?.checkout_id) return;
    pending.checkoutId = String(response.json.data.checkout_id);
    await host.persist();
  }
  const response = await send(host, `checkouts/${encodeURIComponent(pending.checkoutId!)}`, "GET");
  if (host.state.pendingAccountCheckout !== pending || pending.email !== host.state.billingEmail) return;
  if (response.status < 200 || response.status >= 300) return;
  const data = response.json?.data;
  if (data?.settled || ["completed", "fulfilled", "failed", "canceled", "cancelled", "expired"].includes(data?.status)) {
    await host.syncBalance();
    if (host.state.pendingAccountCheckout !== pending || pending.email !== host.state.billingEmail) return;
    host.state.pendingAccountCheckout = null;
    await host.persist();
  }
}

export async function openAccountCheckout(host: CheckoutHost, plan: string): Promise<void> {
  if (running.has(host.state)) return running.get(host.state);
  const operation = (async () => {
    if (!host.state.billingAccountLinked) { new Notice("Connect your billing account first."); return; }
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
    } catch { new Notice("Checkout could not be confirmed. Retry the same purchase to recover it safely."); }
    finally { resumeAccountCheckout(host); }
  })();
  running.set(host.state, operation);
  try { await operation; } finally { running.delete(host.state); }
}
