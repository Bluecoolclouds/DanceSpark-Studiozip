---
name: Danceflow free credit scope
description: Audience, nominal ruble value, and pricing constraints for daily free generation credits.
---

Daily free credits apply to all registered Danceflow accounts, including accounts with active paid subscriptions. Guest sessions are not eligible.

**Why:** The user explicitly chose “all registered accounts” when asked whether paid subscribers also receive the daily credits.

**How to apply:** Keep the allowance account-based and configurable by the administrator. Do not limit it only to accounts without a subscription or extend it to guests.

One credit has a nominal value of 1 ₽. Calculate model prices from their confirmed USD tariffs, the configured USD/RUB rate, and a 15% markup, rounding up to whole credits. Do not treat the nominal value as permission to sell, transfer or cash out free credits.

**Why:** The user chose “1 ₽” for a credit and requested a 15% markup on Higgsfield costs with Russian ruble pricing.

**How to apply:** Keep provider-cost budgets separate from customer credit prices. New global daily issuance remains zero until the owner configures it; never activate a nonzero allowance or remove the generation pause just to demonstrate the feature.

Freeze each account's daily grant once per UTC day; changing the global allowance or personal override affects the next day's grant, not a second issuance today. Keep uncertain provider submissions and failures with unconfirmed billing reserved; refund automatically only when non-billing is confirmed.

**Why:** Multiple devices, retries and concurrent servers must not multiply free grants or release potentially billable funds.

**How to apply:** Use the original daily bucket for settlement/refund even after midnight. A refund to yesterday's bucket must not become today's spendable credits. Protect unresolved reservations from retention and account deletion.
