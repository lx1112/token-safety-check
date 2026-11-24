---
name: polymarket-trader-lookup
description: Look up Polymarket traders and smart money. A trader's P&L, rank, open positions and recent trades; the top traders by period and category; where the best traders are betting now; and who holds the most on one market. Use when asked who a Polymarket trader is, whether they are any good, who the top traders are, or what smart money is betting on. Paid per call in USDC on Base via x402 ($0.01-$0.02).
---

# Polymarket trader lookup (OnchainCheck)

Reads Polymarket traders and markets through the OnchainCheck API at https://onchaincheck.dev, from
Polymarket's public data plus onchain position reads, with OnchainCheck's own record of how leaders' sides did on
resolved markets. It describes what traders hold and did; it is **not advice** and does not predict outcomes.

## When to use

- "Who is this Polymarket wallet / trader?", "is 0x… a good trader?", "what are they holding?"
- "Who are the top Polymarket traders this week (in crypto / politics / sports)?"
- "Where is smart money betting?", "who holds the most YES on <market>?", "who placed the big bets today?"

Not for: placing bets, prices or order books alone, or markets on other venues.

## Payment: read this before the first call

Every call is paid by **the user's own wallet** in USDC on Base with the x402 protocol: the API answers
HTTP 402 with a price, the script signs a USDC payment, and retries. No account or API key.

| Route | Price | What you get |
|---|---|---|
| `GET /polymarket/leaders` | $0.01 | top traders by P&L or volume for a day/week/month/all, overall or one category |
| `GET /polymarket/trader` | $0.01 | one trader: name, X handle, P&L, volume, ranks, top 10 open positions, last 20 trades, record on resolved markets we tracked |
| `GET /polymarket/market/holders` | $0.01 | one market's biggest holders per side with their all-time P&L and rank |
| `GET /polymarket/flow` | $0.01 | big trades in the last 1-24 h on a market or category, with who placed them |
| `GET /polymarket/smart-money` | $0.02 | the busiest open markets and which top-100 traders hold each side |

- Errors and invalid input (HTTP 4xx/5xx) are never charged; "nothing found" answers 422 and is not charged.
- The script refuses any call priced above `ONCHAINCHECK_MAX_USD` (default `0.05`).
- Say what a call costs before chaining several (a leaderboard then 5 trader profiles is $0.06).
- Use a **dedicated wallet with a small balance**. Never ask the user to paste a private key into chat; it must
  already be in the environment as `X402_PRIVATE_KEY`. If it isn't set, stop and say what is needed.

## Setup (once)

From this skill's folder:

```bash
npm install --no-save @x402/fetch@2.28.0 @x402/evm@2.28.0 viem@2.57.8
```

Environment: `X402_PRIVATE_KEY` (required), `ONCHAINCHECK_MAX_USD` (optional cap, default 0.05),
`ONCHAINCHECK_URL` (optional; `https://testnet.onchaincheck.dev` takes free Base Sepolia test USDC).

## Steps

1. **Pick the route from the question.**
   - A wallet given → `/polymarket/trader?address=0x…` (the signer wallet or the Polymarket proxy wallet; a
     polymarket.com profile URL ends in the proxy wallet).
   - "Top traders" → `/polymarket/leaders` with `period` (`day`, `week` default, `month`, `all`), `sort`
     (`pnl` default or `volume`), `category` (`overall` default, `crypto`, `politics`, `sports`, `economics`…),
     `limit` 1-25.
   - A market given → `/polymarket/market/holders?market=<slug, polymarket.com URL, or 0x condition id>`
     (`limit` 1-20 per side), or `/polymarket/flow?market=…` for recent big trades (`hours` 1-24, `minUsd`).
   - "Smart money" with no market → `/polymarket/smart-money` (`period`, `category`).

2. **Call it.** Examples:

   ```bash
   node scripts/onchaincheck.mjs GET "/polymarket/trader?address=0xa05b1e594d0d26ac0ad9a9be19196e2e08e3348c"
   node scripts/onchaincheck.mjs GET "/polymarket/leaders?period=week&sort=pnl&category=crypto&limit=10"
   node scripts/onchaincheck.mjs GET "/polymarket/market/holders?market=iran-nuke-before-2027&limit=10"
   node scripts/onchaincheck.mjs GET "/polymarket/flow?category=crypto&hours=24"
   node scripts/onchaincheck.mjs GET "/polymarket/smart-money?period=month&category=overall"
   ```

   URL-encode a full polymarket.com link passed as `market` (or pass just its last path part, the slug).

3. **Follow up only if asked.** A leaderboard gives wallets; profile at most the few the user cares about with
   `/polymarket/trader`, saying the cost first.

4. **Report** briefly: for a trader, name and X handle, all-time P&L and rank, portfolio value, the largest open
   positions (market, side, size, entry vs current price), and their record on resolved markets if present; for a
   market, which side the proven traders lean to and the biggest holders. End with "not advice".

## Reading the result

- `/polymarket/trader`: `profile` (name, pseudonym, X handle, account created, profile URL),
  `portfolioValueUsd`, `allTime` (`pnlUsd`, `volumeUsd`, `rankByPnl`, `rankByVolume`), `openPositions`
  (`count`, `top[]` with market, outcome, size, avgPrice, currentPrice, valueUsd, pnlUsd), `recentTrades[]`
  (time, side, market, outcome, size, price, USD, tx), and `recordedAccuracy` when the wallet held a big side
  in markets OnchainCheck recorded that have since resolved. When `openPositions.coveragePercent` is present,
  positions were read onchain and only that share of the portfolio's value was found, and `avgPrice` and
  P&L per position are null: say so instead of reporting missing P&L as zero.
- `/polymarket/leaders`: `traders[]` with rank, wallet, name, X handle, P&L, volume, portfolio value (top 10).
- `/polymarket/market/holders`: `sides[]` per outcome with price and holders (shares, value, and for the top 5
  all-time P&L and rank); `proven[]` per outcome: how many of the top holders are profitable all-time and the
  value they hold. "No market with this slug" (422, not charged) usually means an event slug that names several
  markets: use one market's slug.
- `/polymarket/smart-money`: `markets[]` with `leadersIn`, `leadersValueUsd`, `leaning` (`outcome`,
  `valueShare` %, price) and per side the leaders by name, rank and X handle; `trackRecord` (how often the
  leaders' side won in resolved markets we recorded) when available.
- `/polymarket/flow`: `headlines[]` (one-line summaries, quote them), `bigTrades`, `totalUsd`, `topTraders[]`,
  `largestTrades[]`, and `partial` when the window wasn't fully read.
- Leaderboard P&L and ranks come from Polymarket; large P&L is not proof of skill on the next market.

## Other ways to call it

Hosted MCP for x402-capable MCP clients: `https://onchaincheck.dev/mcp` (tools `polymarket_trader_profile`,
`polymarket_top_traders`, `polymarket_market_holders`, `polymarket_trade_flow`, `polymarket_smart_money`).
All routes and prices: `GET https://onchaincheck.dev/` (free).
