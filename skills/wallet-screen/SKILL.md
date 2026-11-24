---
name: wallet-screen
description: Screen a crypto address before paying or accepting funds. OFAC SDN address check, sanctioned-counterparty exposure, who the address is (exchange, mixer, contract, wallet age, first funder) and an ok/caution/block verdict on Base, Ethereum, Arbitrum, Optimism, Polygon and Solana. Use before sending crypto, when onboarding a counterparty, or when asked "is this address safe / sanctioned / who is this wallet?". Paid per call in USDC on Base via x402 ($0.005-$0.02).
---

# Wallet screen (OnchainCheck)

Answers "is it safe to deal with this address?" with the OnchainCheck API at https://onchaincheck.dev:
an OFAC SDN screen of the address itself, whether it has transacted with sanctioned addresses, and who it is
(exchange, token issuer, verified contract name, mixer, wallet age and first funder). It is a data check,
**not legal advice and not a complete AML or KYC process**; say so when you report it.

## When to use

- Before an agent sends or accepts a crypto payment: "is it safe to pay 0x…?"
- "Is this address sanctioned?", "who is this wallet?", "has this wallet touched Tornado Cash / Lazarus?"
- Light counterparty screening for a person or business the user is about to deal with.

Not for: screening people or companies by name (that is `GET /sanctions/search?name=…`, $0.005, on the same
host), identifying a wallet's owner (wallets get no owner name), or chains not listed above.

## Payment: read this before the first call

Every call is paid by **the user's own wallet** in USDC on Base with the x402 protocol: the API answers
HTTP 402 with a price, the script signs a USDC payment, and retries. No account or API key.

| Route | Price | What you get |
|---|---|---|
| `GET /address/screen` | $0.005 | is the address on OFAC's SDN list of digital currency addresses; wallet or contract, and who |
| `GET /check/lite` | $0.01 | ok / caution / block with plain reasons: SDN screen, who it is, age, first funder, large transfers; funder and counterparties screened too |
| `GET /check` | $0.02 | `/check/lite` plus the 0-100 risk score of a token being paid or received |
| `GET /address/exposure` | $0.01 | sanctioned counterparties in the wallet's latest 4,000 transfers (EVM chains only) |
| `GET /<chain>/wallet-profile` | $0.01 | age, first funder, balance, latest transfers, top counterparties, tokens it deployed |

- Errors and invalid input (HTTP 4xx/5xx) are never charged.
- The script refuses any call priced above `ONCHAINCHECK_MAX_USD` (default `0.05`).
- Tell the user what you are about to spend when screening more than a couple of addresses.
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

1. **Get the address, and the chain if known.** `0x` + 40 hex is EVM (`base`, `eth`, `arbitrum`,
   `optimism`, `polygon`); base58 is Solana (`solana`). For `/check` and `/check/lite` you may omit `chain`:
   a `0x` address is then checked on the EVM chain where it is busiest (reported in `chainDetection`).

2. **Before a payment, one call** ($0.01):

   ```bash
   node scripts/onchaincheck.mjs GET "/check/lite?address=0x2211d1D0020DAEA8039E46Cf1367962070d77DA9&chain=base"
   ```

   Add `&expect=eoa` (or `contract`) when the user knows what the address should be: a mismatch gives caution.
   If a token is being paid or received, use `/check` ($0.02) with `&token=<token address>` to add its risk score.

3. **Sanctions only, cheapest** ($0.005), also for addresses on other currencies (`chain=other`):

   ```bash
   node scripts/onchaincheck.mjs GET "/address/screen?address=0x098B716B8Aaf21512996dC57EB0615e2383E2f96&chain=eth"
   ```

4. **Deeper look** when the verdict is caution or block, or the user asks who the wallet has dealt with:

   ```bash
   node scripts/onchaincheck.mjs GET "/address/exposure?address=0x098B716B8Aaf21512996dC57EB0615e2383E2f96&chain=eth"
   node scripts/onchaincheck.mjs GET "/base/wallet-profile?address=0x2211d1D0020DAEA8039E46Cf1367962070d77DA9"
   ```

   `wallet-profile` exists per chain: `/base/`, `/eth/`, `/arbitrum/`, `/optimism/`, `/polygon/`.

5. **Report**: the verdict (ok / caution / block) and each reason's `text`, whether the address is on the SDN list
   (with entity and program on a match) and the list date (`listAsOf`), exposure if you checked it, and what the
   address is. End with "not legal advice; screens OFAC's published addresses only".

## Reading the result

- `/check*` `verdict`: `ok`, `caution` or `block`; `reasons[]` are `{ level, code, text }`. `block` means a
  sanctions match or something equally serious: tell the user plainly not to proceed without their own review.
- `/address/screen`: `sanctioned` true/false, `matches[]` (listed address, currency, entity, programs, listing
  date), `listAsOf`. "Not found" means not on OFAC's published address list as of that date, nothing more:
  most sanctioned parties' addresses are never published.
- `/address/exposure`: `exposed`, `sanctionedCounterparties[]` (entity, direction, transfer count, assets, first
  and last date, an example tx). Direct exposure only (one hop), from the latest 4,000 transfers.
- `wallet-profile`: `age.ageDays`, `firstFunder`, `account.kind` (EOA, smart wallet, contract),
  `recentTransfers`, `largeTransfers`, `topCounterparties`, and (when OnchainCheck recorded them) tokens it
  deployed with how many lost their liquidity.
- `/check*` also carry `summary` (sanctioned, wallet or contract, age, first funder), `sanctions`, `identity`
  and `checks`; `/check` adds `token` with the token's risk score.

## Other ways to call it

Hosted MCP for x402-capable MCP clients: `https://onchaincheck.dev/mcp` (tools `prepayment_safety_check`,
`prepayment_safety_check_lite`, `address_sanctions_screen`, `address_sanctions_exposure`, `wallet_profile`).
All routes and prices: `GET https://onchaincheck.dev/` (free).
