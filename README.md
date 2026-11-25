# Token Radar — Pre-Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/chiangprc/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/chiangprc/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar — rank pre-token protocols by implied value (model C log-log on TVL), with a farm plan for each. Built for the make.fun token-radar-01 bounty.

## Run it

Requires Node.js 22 or later. Standard library only, no dependencies to install.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

In the grader's container the sealed snapshot is mounted at `/input/snapshot.json` and the outputs go to `/output`. The program writes `board.json` (the ranked board) and `data.js` (the dashboard's data), copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json`. Open `dashboard/index.html` in a browser to explore the board (Board / Model / Farm / About data tabs).

## Data and model

- **Data source:** a sealed DefiLlama snapshot of 758 protocols (as of 2026-11-14), provided by the grader. No other data is used.
- **Model C (log-log OLS):** `implied_usd = exp(6.9646 + 0.5223 × ln(tvl_usd))`, fitted on the 128 comparable protocols that have both TVL and market cap recorded. The canonical double-precision coefficients live in `lib/model.ts`; the values above are rounded for display only.
- **Coverage:** 342 pre-token protocols are scored; 40 of them are on the watchlist (TVL of at least $50M).
- **What "implied value" means:** a conditional estimate of value implied by TVL alone — an order-of-magnitude estimate, not a precise valuation. Leave-one-out median error is about 3.4×, and only 32% of estimates land within 2× of the comparable's actual value. It is **not** a price prediction, not a future FDV, and not a market-cap forecast.
- **What "pre-token" means here:** the snapshot records no token for the protocol (both `gecko_id` and `symbol` are null). That only means no token is recorded in this snapshot — it does **not** mean the protocol has no token, has never issued one, or will issue one in the future.
- **What the ranking is:** the model's computed ordering by implied value. It does **not** imply issuance probability, future price, or investment advice. This project has no trading execution functionality and makes no buy or sell recommendation.

## Files

- `main.ts` — entrypoint: reads the sealed snapshot, scores every protocol, writes `board.json` / `data.js` / `dossier.json`.
- `lib/model.ts` — model C (log-log OLS), snapshot parsing, board construction.
- `vendor/makefun-board.ts` — vendored make.fun board library (as shipped in the kit).
- `dashboard/` — static board viewer (`index.html`, `app.css`, `app.js`).
- `screenshots/` — 4 screenshots of the dashboard (board, protocol detail, filtered CEX view, farm view).

## License

MIT — see [LICENSE](LICENSE).

---
Entered on [make.fun](https://make.fun/?ref=v06jh357&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
