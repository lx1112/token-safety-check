---
name: token-rug-check
description: Rug and honeypot check for a token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana. Returns a 0-100 risk score with plain reasons, a simulated sell, and a fingerprint to track changes. Use when the user asks if a token is safe, a rug, a honeypot or a scam, before buying a token, or to monitor tokens they hold. Paid per call in USDC on Base via x402 ($0.002-$0.01).
---

# Token rug check (OnchainCheck)

Checks one token (or up to 5) with the OnchainCheck API at https://onchaincheck.dev and explains the result.
The check is rules-based and reads the chain directly: who can mint, freeze, blacklist, pause or change fees,
upgradeable code, Solana Token-2022 extensions, holder concentration, liquidity, a simulated buy and sell
against the main pool (nothing is sent), and the deployer's earlier launches. It is not investment advice;
say so when you report it.

## When to use

- "Is this token safe / a rug / a honeypot / a scam?", "rug check 0x…", "can I sell this?"
- Before an agent buys or swaps into a token it hasn't checked.
- Monitoring tokens the user holds: re-check on a schedule and report what changed.

Not for: price predictions, whether to buy (give the facts, not a recommendation), or tokens on other chains.

## Payment: read this before the first call

Every call is paid by **the user's own wallet** in USDC on Base with the x402 protocol: the API answers
HTTP 402 with a price, the script signs a USDC payment, and retries. There is no account or API key.

| Route | Price | What you get |
|---|---|---|
| `GET /token/quick` | $0.002 | score, level, summary, top 3 reasons, pass/warn/fail checks, simulated sell |
| `GET /token` | $0.01 | everything: every reason, the facts, deployer record, market, fingerprint, changes |
| `POST /verdict` | $0.01 | a grade (CLEAN, MID, SKETCHY, RUGGY), one-liner, short take, share-card link |
| `GET /watchlist` | $0.01 | up to 5 tokens re-checked in one call, with alerts for what changed |

- Errors and invalid input (HTTP 4xx/5xx) are never charged.
- The script refuses any call priced above `ONCHAINCHECK_MAX_USD` (default `0.05`). Leave it low.
- Tell the user what a call costs before running more than a couple. Start with `/token/quick`.
- Use a **dedicated wallet with a small balance** ($1 covers 100 full checks or 500 quick ones). Never ask
  the user to paste a private key into chat; it must already be in the environment as `X402_PRIVATE_KEY`.

If `X402_PRIVATE_KEY` is not set, stop and tell the user what is needed (a new wallet, a little USDC on Base,
the key in `X402_PRIVATE_KEY`). Don't try to work around it.

## Setup (once)

From this skill's folder:

```bash
npm install --no-save @x402/fetch@2.28.0 @x402/evm@2.28.0 viem@2.57.8
```

Environment: `X402_PRIVATE_KEY` (required), `ONCHAINCHECK_MAX_USD` (optional cap, default 0.05),
`ONCHAINCHECK_URL` (optional; `https://testnet.onchaincheck.dev` takes free Base Sepolia test USDC).

## Steps

1. **Get the address and chain.** EVM tokens are `0x` + 40 hex; Solana mints are base58 (32-44 chars).
   Chains: `base`, `eth`, `arbitrum`, `optimism`, `polygon`, `solana`. Without `chain`, a base58 address means
   Solana and a `0x` address means Base: ask the user if a `0x` token might be on another chain.
   A ticker alone ("$PEPE") is not enough: ask for the contract address.

2. **Quick check first** ($0.002):

   ```bash
   node scripts/onchaincheck.mjs GET "/token/quick?chain=base&address=0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed"
   ```

3. **Full check** ($0.01) when the quick check is medium risk or worse, the user wants details, or you will
   monitor the token:

   ```bash
   node scripts/onchaincheck.mjs GET "/token?chain=base&address=0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed"
   ```

4. **Report** in a few lines: the score and level, the reasons in plain words, whether a simulated sell
   worked and its tax, liquidity in USD, and anything notable about the deployer. End with "rules-based, not
   investment advice".

5. **To monitor**, keep `watch.fingerprint` from the full check and pass it back as `since` later; the answer
   then has `watch.changes` (new or removed risks, owner or authority changes, liquidity or price moves):

   ```bash
   node scripts/onchaincheck.mjs GET "/token?chain=base&address=0x...&since=<fingerprint>"
   ```

   For several tokens, one watchlist call ($0.01 for up to 5) with fingerprints in the same order
   (leave a slot empty for a new token):

   ```bash
   node scripts/onchaincheck.mjs GET "/watchlist?tokens=base:0xAAA...,solana:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN&since=<fp1>,<fp2>"
   ```

   Report each line of `alerts`, then store the new fingerprints for next time.

6. **For a chat reply or a shareable answer**, the verdict ($0.01):

   ```bash
   node scripts/onchaincheck.mjs POST "/verdict" '{"tokenAddress":"0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed","chain":"base"}'
   ```

   Add `"requestKey":"<8-128 letters, digits or _.:->"` and a retry with the same key is not charged twice.

## Reading the result

- `/token/quick` answers flat: `score`, `level`, `summary`, `topReasons[]` (`{ code, text }`), `checks`,
  `trading` (`canBuy`, `canSell`, `buyTaxPct`, `sellTaxPct`), and a `fullReport` pointer to `/token`.
- `/token` nests them: `risk.score`, `risk.level`, `risk.summary`, `risk.reasons[]` (`{ code, points, text }`),
  plus `checks`, `trading`, `market`, `owner`, `proxy`, `privilegedFunctions`, `deployer` (mainnet) and `watch`.
- The score 0-100 is the sum of each reason's points, capped at 100. Level: low (0-19), medium (20-44),
  high (45-69), critical (70+).
- Each reason's `text` is already plain English; quote it. Common codes:
  `sell-blocked` (a simulated sell reverted: likely honeypot), `extreme-sell-tax` / `high-sell-tax`,
  `can-mint`, `can-blacklist`, `can-change-fees`, `trading-switch`, `can-pause`, `upgradeable`,
  `owner-not-renounced`, `concentrated-holders`, `whale-wallet`, `no-liquidity` / `very-thin-liquidity` /
  `thin-liquidity`, `fresh-pool`, `permanent-delegate` / `can-freeze` / `transfer-fee` / `transfer-hook`
  (Solana), `deployer-prior-rugs` / `serial-deployer` (the creator's earlier tokens lost their liquidity, or
  they launch in bulk), `tax-raised` / `sell-blocked-since-launch` (the rules changed after we first saw it),
  `known-issuer`, `possible-impersonation`.
- `checks`: pass / warn / fail / not-checked per area (trading, powers, liquidity, holders, deployer,
  identity); in `/token` each has `status`, the reason codes behind it and a `note` when not checked. Solana
  trading is judged from the token's rules, not simulated. "not-checked" is unknown, not a pass.
- Watchlist entries: `score`, `level`, `reasons` (codes), `trading`, `priceUsd`, `liquidityUsd`,
  `fingerprint`; top-level `alerts[]` are one line per change.
- `/verdict`: `grade`, `oneLiner`, `take` (up to 220 characters, ready to post), `score`, `reasons`, `card`
  (share-card link, may be null).
- Powers count for less on tokens with deep liquidity, where they are usually a big issuer's compliance
  controls (USDC can freeze and mint). Say that when it applies, instead of calling USDC risky.
- `deployer` is null when we didn't record the token's launch; that is "unknown", not "clean".
- Verdict grades: RUGGY (score 70+ or a creator with past rugs), SKETCHY (45+), MID, CLEAN.

## Other ways to call the same checks

- MCP server for Claude Desktop, Cursor and other MCP clients: `npx -y token-safety-check` with
  `X402_PRIVATE_KEY` in its env; spending cap `TOKEN_SAFETY_MAX_USD` (default 0.05). Tools
  `check_token_safety`, `token_verdict`, `watch_tokens`.
- Code: `npm install token-safety-check` (client, Vercel AI SDK / Mastra tools, ElizaOS plugin):
  https://github.com/lx1112/token-safety-check
- Hosted MCP for x402-capable MCP clients: `https://onchaincheck.dev/mcp` (tools `token_quick_check`,
  `token_risk_check`, `token_verdict`, `token_watchlist`).
