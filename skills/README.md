# OnchainCheck Agent Skills

Three [Agent Skills](https://agentskills.io) (a folder with a `SKILL.md`) that let Claude Code, Claude, Codex,
Cursor and other skill-aware agents call the [OnchainCheck](https://onchaincheck.dev) API and pay for each call
themselves with [x402](https://x402.org) (USDC on Base). No account or API key.

| Skill | What the agent can do | Price per call |
|---|---|---|
| [`token-rug-check`](token-rug-check/SKILL.md) | Rug and honeypot check for a token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana: 0-100 risk score with reasons, simulated sell, change tracking, watchlist, verdict | $0.002-$0.01 |
| [`polymarket-trader-lookup`](polymarket-trader-lookup/SKILL.md) | A Polymarket trader's P&L, rank, positions and trades; top traders; where smart money is betting; one market's biggest holders; big-trade flow | $0.01-$0.02 |
| [`wallet-screen`](wallet-screen/SKILL.md) | Before paying an address: OFAC SDN screen, sanctioned-counterparty exposure, who it is, ok/caution/block verdict | $0.005-$0.02 |

## Install

With the [skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add lx1112/token-safety-check
```

Or copy a folder by hand: into `~/.claude/skills/` (Claude Code, all projects), `.claude/skills/` (one
project), or wherever your agent loads skills from. Then, once, inside each skill folder:

```bash
npm install --no-save @x402/fetch@2.28.0 @x402/evm@2.28.0 viem@2.57.8
```

## Payment and spending cap

Each skill runs `scripts/onchaincheck.mjs`, which reads the price from the API's HTTP 402 answer (free),
refuses anything above `ONCHAINCHECK_MAX_USD` (default `$0.05`), then signs a USDC payment from the wallet in
`X402_PRIVATE_KEY` and retries. Errors and invalid input are never charged.

- Use a **new wallet just for this** and send it a little USDC on Base: $1 covers 100 full token checks.
- The key stays on your machine and only signs payments of the quoted price. Never paste it into a chat.
- To try it free, set `ONCHAINCHECK_URL=https://testnet.onchaincheck.dev` and fund the wallet with Base Sepolia
  test USDC from the [Circle faucet](https://faucet.circle.com).

The three `scripts/onchaincheck.mjs` files are the same script, copied so each skill folder works on its own.
It sends the User-Agent `onchaincheck-skill/<skill name>` so we can count use per skill; nothing else about you.

Results are rules-based data, not financial or legal advice. MIT licensed.
