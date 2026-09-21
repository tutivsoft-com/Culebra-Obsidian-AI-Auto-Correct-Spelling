# Culebra Constance billing contract

Culebra source uses the account-linked Constance adapter. A stable installation
ID is linked after sign-in, and account free usage plus paid credit spend are
server-authoritative.

Use `/auth/login` or `/auth/register`, then `/billing/installations/link`,
`/billing/entitlements/me`, `/billing/free-usage/claim`, and
`/billing/credits/spend` under `https://app.tutivsoft.com/api/v1`. Store both
the access and refresh tokens; refresh the access token when the central API
returns an authentication failure. Authenticated checkout uses
`POST /billing/checkout` with `{ app_id, plan_code, installation_id, quantity,
coupon_code }` and a stable `Idempotency-Key`; poll
`/billing/checkouts/{checkout_id}` and then refresh entitlements after payment.
The one-time tiers map to the central `standard`, `pro`, and `ultimate` pack
codes and use the verified live price IDs in `main.ts`. `/buy` is retained only
as the Contract v9 fallback when a successful transaction has no checkout URL.

Every paid operation must persist one stable event ID before the correction and
reuse it after a timeout. `/billing/credits/status` or `/billing/spend/status`
resolves unknown events; never create a replacement event ID merely because the
response was lost.

HTTP 402 is confirmed insufficient allowance, 401/403 is an auth/session or
ownership problem, 404 may mean the installation is not linked, and 409 means
an idempotency/event conflict. Passwords are never stored. This client has no
backend, so signed `X-Tutiv-*` requests and entitlement callbacks with raw-body
HMAC verification are not applicable; account-linked bearer endpoints are the
authoritative path.
