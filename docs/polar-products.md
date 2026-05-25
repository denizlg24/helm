# Polar products to create

Helm is metadata-driven: Polar holds prices, each product carries `helm_*`
metadata, and the webhook (`apps/api/src/billing/billing.catalog.ts`) applies the
effect with zero code change. Create the products below in the Polar dashboard.

## Global rules

- **Currency: USD.** Price extraction (`polar.service.ts`) only reads prices when
  `priceCurrency === "usd"`; non-USD prices are ignored and surface as `null`.
- **Billing interval: monthly** for all plans and modules (allowances are `/mo`).
- All metadata values are **strings**.
- Checkout sets `externalCustomerId = workspaceId` (already wired) — no per-product
  config needed for that.

## Plans (recurring, one active per workspace)

Plans meter LLM usage only; they do not gate modules. Allowance values are already
in `PLAN_DEFINITIONS` — they are **not** the price. Price each plan to cover its
allowance plus margin (see "Pricing inputs" below).

**Starter has no Polar product.** Polar does not allow $0 products, and Starter is
the free default: entitlements are applied in-app at signup and on plan
downgrade/revoke, with no subscription row. Only paid plans get products.

| Product name | Price | `helm_kind` | `helm_plan` | LLM allowance | Rate limit |
|---|---|---|---|---|---|
| Helm Pro | **TBD** | `plan` | `pro` | $20 / mo | 240 / min |
| Helm Enterprise | **TBD** | `plan` | `enterprise` | $250 / mo | 600 / min |

## Module add-ons (recurring, one row per enabled module)

Free by default (do **not** create products): `home, settings, assistant,
llm-usage, api-tokens, data-export, kanban, calendar, pomodoro`.

Launching now — 9 standalone paid modules, one product each:

| Product name | Price | `helm_kind` | `helm_modules` |
|---|---|---|---|
| Helm Notes | TBD | `module` | `notes` |
| Helm Whiteboards | TBD | `module` | `whiteboard` |
| Helm Spreadsheets | TBD | `module` | `spreadsheets` |
| Helm Timetable | TBD | `module` | `timetable` |
| Helm Journal | TBD | `module` | `journal` |
| Helm People | TBD | `module` | `people` |
| Helm IMAP Inbox | TBD | `module` | `imap-inbox` |
| Helm Email Triage | TBD | `module` | `triage` |
| Helm Resources | TBD | `module` | `resources` |

After setting prices, mirror them into `MODULE_MONTHLY_PRICE_USD_CENTS`
(`billing.catalog.ts`) so the app can render the pricing page (display-only).

### Deferred: Publish bundle

When the Publish group launches, create **one** product (not six). `helm_modules`
accepts a comma-separated list:

```
helm_kind    = module
helm_modules = blog,projects,timeline,now,comments,contact-form
```

## Credit top-ups (one-time orders)

Price = face value; `helm_credits_cents` is what gets granted to the ledger.

| Product name | Price | `helm_kind` | `helm_credits_cents` |
|---|---|---|---|
| Helm Tokens — $5 | $5 | `credits` | `500` |
| Helm Tokens — $10 | $10 | `credits` | `1000` |
| Helm Tokens — $20 | $20 | `credits` | `2000` |
