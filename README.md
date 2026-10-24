# Tribyu Database

Cloudflare Worker + D1 database that served the data for [Tribyu Tracker](https://github.com/iamcnl/TribyuTracker) (prize pool, hashrate, payouts and auction-house history for the Tribyu game).

> **Project status: archived.**
> Tribyu was cancelled in 2025 and data ingestion has been switched off. The Worker still serves the stored data, which is a frozen snapshot; nothing new is collected, and the deployment may be taken down at any time.

## API

All routes are `GET` and return JSON with open CORS.

| Route | Returns |
|---|---|
| `/get-channel-data` | `[{id, prize_pool, hashrate, timestamp}]` |
| `/get-payment-data` | `[{id, timestamp, sats_paid}]` |
| `/get-auction-data` | `[{id, username, item, quantity, price, timestamp, item_id}]` |
| `/get-ah-history` | `[{id, seller, buyer, item, quantity, price, timestamp}]` |
| `/get-current-metrics` | latest `{prize_pool, hashrate, last_updated}` |
| `/download-*` | the same tables as downloadable `.json` files |

`/log-*` routes were the ingestion side (read Discord messages, write to D1). They require a `USER_TOKEN` secret and are inert without it.

## Stack

TypeScript, Cloudflare Workers, Cloudflare D1 (SQLite), Wrangler.

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars    # leave USER_TOKEN empty
npx wrangler d1 create discord-data   # put the returned id into wrangler.jsonc
npm run dev
```

Tables are created on demand by the worker code. The original data snapshot is not included in this repository.

## Notes

- Built quickly in 2025 with heavy LLM assistance and cleaned up for archival.
- The `test/` folder is unmodified Wrangler template boilerplate and does not match the worker's behavior.