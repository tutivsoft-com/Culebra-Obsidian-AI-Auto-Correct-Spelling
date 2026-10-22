// The URL can be replaced by the CLI harness when testing the real local API.
export const CONSTANCE_API = "https://app.tutivsoft.com/api/v2";
export const BILLING_UNIT = "characters";

/** Preserve the UI's balance shape while using the server's held-unit rules. */
export function accountBalance(data: any, appId: string): any {
  const balances = data?.balances;
  if (data?.app_id !== appId || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(balances)) throw new Error("Account balance could not be verified.");
  const rows = balances.filter((row: any) => row?.unit === BILLING_UNIT);
  if (rows.length !== 1) throw new Error("Character balance could not be verified.");
  const row = rows[0];
  if (![row.free_remaining, row.free_held, row.paid_balance, row.paid_held, row.spendable, row.deficit].every(Number.isSafeInteger)
    || [row.free_remaining, row.free_held, row.paid_held, row.spendable, row.deficit].some(n => n < 0)
    || row.free_held > row.free_remaining) throw new Error("Account balance could not be verified.");
  const free = Math.max(0, row.free_remaining - row.free_held);
  const paid = Math.max(0, row.paid_balance - row.paid_held);
  if (row.spendable !== free + paid) throw new Error("Account balance could not be verified.");
  return { ...data, free_usage: { remaining: row.deficit ? 0 : free }, credits: { balance: row.deficit ? 0 : paid, total_available: row.deficit ? 0 : paid } };
}
