# Culebra Constance billing contract

Culebra source uses the account-linked Constance adapter. A stable installation
ID is linked after sign-in, and account free usage plus paid credit spend are
server-authoritative.

Use `/auth/login` or `/auth/register`, then `/billing/installations/link`,
`/billing/entitlements/me`, `/billing/free-usage/claim`, and
`/billing/credits/spend` under `https://app.tutivsoft.com/api/v1`. Every paid
operation must persist one stable event ID before the correction and reuse it
after a timeout. `/billing/credits/status` or `/billing/spend/status` resolves
unknown events; never create a replacement event ID merely because the response
was lost.

HTTP 402 is confirmed insufficient allowance, 401/403 is an auth/session or
ownership problem, 404 may mean the installation is not linked, and 409 means
an idempotency/event conflict. Passwords are never stored. Keep any old
unsigned same-install behavior only as a documented compatibility fallback.
