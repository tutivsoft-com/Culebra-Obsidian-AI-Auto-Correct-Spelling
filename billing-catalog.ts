import { Notice, Setting, requestUrl } from "obsidian";
import { refreshBillingSession } from "./constance-account";

const BASE = "https://app.tutivsoft.com/api/v1";

interface BillingCatalogHost {
  appId: string;
  installationId: string;
  state: any;
  persist(): Promise<void>;
  syncBalance?(): Promise<void>;
  resumeCheckout?(): void;
}

async function send(host: BillingCatalogHost, path: string, body?: unknown, idempotencyKey?: string): Promise<any> {
  if (!host.state.billingAccessToken && host.state.billingRefreshToken) {
    await refreshBillingSession(host.state, host.persist);
  }
  const request = () => requestUrl({
    url: `${BASE}${path}`,
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(host.state.billingAccessToken ? { Authorization: `Bearer ${host.state.billingAccessToken}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    throw: false,
  });
  let response = await request();
  if (response.status === 401 && host.state.billingRefreshToken && await refreshBillingSession(host.state, host.persist)) {
    response = await request();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(response.json?.detail?.message || (typeof response.json?.detail === "string" ? response.json.detail : `Billing service unavailable (HTTP ${response.status}).`));
  }
  return response.json?.data;
}

/** Read current offers and their display values from Constance's public catalog. */
export function joinPublicPacks(products: any, appId: string): any[] {
  if (products?.app_id !== appId || !Array.isArray(products?.packs)) return [];
  return products.packs.map((pack: any) => {
    const priceId = typeof pack?.price_id === "string" ? pack.price_id : "";
    const units = Number(pack?.native_units);
    const unit = typeof pack?.unit === "string" && pack.unit.trim() ? pack.unit.trim() : "credits";
    const amount = typeof pack?.formatted_total === "string" ? pack.formatted_total : "";
    const available = pack?.available === true && !!priceId && Number.isSafeInteger(units) && units > 0 && !!amount;
    return { pack, priceId, units, unit, amount, available };
  });
}

export function addLivePacks(root: HTMLElement, host: BillingCatalogHost): void {
  host.resumeCheckout?.();
  const section = root.createDiv();
  const status = section.createEl("p", { text: "Loading current Paddle prices…" });
  void send(host, `/billing/public-products?app_id=${encodeURIComponent(host.appId)}`).then(products => {
    const offers = joinPublicPacks(products, host.appId);
    if (!offers.length) throw new Error("No current one-time offers are available.");
    status.setText("Current provider pricing. Final checkout calculates applicable tax.");
    for (const { pack, priceId, units, unit, amount, available } of offers) {
      const description = [pack?.description, Number.isSafeInteger(units) && units > 0 ? `${units.toLocaleString()} ${unit}` : "", available ? "" : pack?.availability_reason || "Current price unavailable"].filter(Boolean).join(" · ");
      const row = new Setting(section).setName(pack.price_name || pack.name || pack.code || "One-time offer").setDesc(description);
      row.addButton(button => button.setButtonText(available ? `Buy ${amount}` : "Pricing unavailable").setDisabled(!available).onClick(async () => {
        button.setDisabled(true);
        try {
          if (!host.state.billingAccountLinked) throw new Error("Connect your billing account before buying credits.");
          let pending = host.state.previewPendingCheckout;
          if (pending?.owner && pending.owner !== host.state.billingEmail) throw new Error("Sign in to the account owning the pending purchase.");
          if (pending?.checkout_id) {
            const checkout = await send(host, `/billing/checkouts/${encodeURIComponent(pending.checkout_id)}`);
            if (checkout.settled === true || ["completed", "fulfilled", "canceled", "cancelled", "failed", "expired", "voided", "rejected"].includes(checkout.status)) {
              host.state.previewPendingCheckout = undefined;
              await host.persist();
              await host.syncBalance?.();
              return;
            }
          }
          if (pending?.price_id && pending.price_id !== priceId) throw new Error("A purchase is pending. Resolve its status before another purchase.");
          const legacyPlan = pending && !pending.price_id ? pending.plan_code : undefined;
          const request = pending || { price_id: priceId, idempotency_key: `checkout_${crypto.randomUUID()}`, owner: host.state.billingEmail };
          host.state.previewPendingCheckout = request;
          await host.persist();
          const oldCheckout = !!legacyPlan;
          const checkout = await send(host, `/billing/${oldCheckout ? "checkout" : "checkout-price"}`, {
            app_id: host.appId,
            installation_id: host.installationId,
            ...(oldCheckout ? { plan_code: legacyPlan } : { price_id: request.price_id }),
            quantity: 1,
          }, request.idempotency_key);
          if (!checkout?.checkout_id) throw new Error("Checkout is still being confirmed; retry the same purchase to recover it safely.");
          request.checkout_id = String(checkout.checkout_id);
          await host.persist();
          await host.syncBalance?.();
          host.resumeCheckout?.();
          if (typeof checkout.checkout_url === "string" && checkout.checkout_url) window.open(checkout.checkout_url, "_blank", "noopener");
          else new Notice("Checkout is still being confirmed. Its status will refresh when you return.");
        } catch (error) {
          new Notice(error instanceof Error ? error.message : "Checkout unavailable.");
        } finally {
          button.setDisabled(!available);
        }
      }));
    }
  }).catch(() => status.setText("Pricing temporarily unavailable. Refresh before buying."));
}
