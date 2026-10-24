# token-safety-check

**Is this token safe?** A rug check for any token on **Base, Ethereum, Arbitrum, Optimism, Polygon
or Solana**, for AI agents and scripts. Each check returns:

- a **0–100 risk score** and level (low, medium, high, critical) with **plain-language reasons**:
  - who can mint, freeze, blacklist, pause or change fees
  - upgradeable contract code
  - Token-2022 permanent delegates, transfer fees and hooks
  - holder concentration
  - thin or missing liquidity
- the facts behind the score: owner, authorities, supply, top holders, pools;
- USD price and liquidity;
- a **fingerprint**. Pass it back as `since` and the next check tells you what changed: new risks,
  authority changes, liquidity or price moves. That makes it easy to monitor tokens on a schedule.

Checks cost **$0.01 each in USDC on Base**, paid automatically with [x402](https://x402.org) from a
wallet you control. There's no account or API key. Errors and invalid input are never charged, and
a spending cap stops any check priced above your limit (default $0.05).

The score is rules-based and is not investment advice. Powers count for less on tokens with deep
liquidity, where they're usually a large issuer's compliance controls (USDC can freeze and mint, for
example).

## Use it from Claude Desktop, Cursor or any MCP client

Create a **new wallet just for this** and send it a little USDC on Base: $1 covers 100 checks. Then
add to your MCP config (for Claude Desktop, that's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "token-safety-check": {
      "command": "npx",
      "args": ["-y", "token-safety-check"],
      "env": { "X402_PRIVATE_KEY": "0x<private key of the dedicated wallet>" }
    }
  }
}
```

The server has one tool, `check_token_safety` (`address`, optional `chain` and `since`). Optional
environment variables:

- `TOKEN_SAFETY_MAX_USD`: per-check spending cap, default `0.05`.
- `TOKEN_SAFETY_ENDPOINT`: point at another deployment.

## Use it from code

```bash
npm install token-safety-check
```

```ts
import { createTokenSafetyClient } from "token-safety-check";

const client = createTokenSafetyClient({ privateKey: process.env.X402_PRIVATE_KEY as `0x${string}` });

const first = await client.checkToken({ chain: "base", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" });
console.log(first.risk.score, first.risk.level, first.risk.summary);
// 15 low Low risk: the owner can pause all transfers; ownership is not renounced.

// Later: what changed since then?
const later = await client.checkToken({ address: first.address, chain: "base", since: first.watch.fingerprint });
if (later.watch.changes?.anythingChanged) console.log(later.watch.changes);
```

## Use it in Coinbase AgentKit

```ts
import { customActionProvider } from "@coinbase/agentkit";
import { z } from "zod";
import { createTokenSafetyClient } from "token-safety-check";

const safety = createTokenSafetyClient({ privateKey: process.env.X402_PRIVATE_KEY as `0x${string}` });

export const tokenSafety = customActionProvider({
  name: "check_token_safety",
  description: "Rug check a token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana: 0-100 risk score with reasons.",
  schema: z.object({
    address: z.string().describe("Token contract or Solana mint address"),
    chain: z.enum(["base", "eth", "arbitrum", "optimism", "polygon", "solana"]).optional(),
  }),
  invoke: async (args) => JSON.stringify(await safety.checkToken(args)),
});
// Add tokenSafety to the actionProviders you pass to AgentKit.from(...).
```

## Use it in LangChain (JS)

```ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createTokenSafetyClient } from "token-safety-check";

const safety = createTokenSafetyClient({ privateKey: process.env.X402_PRIVATE_KEY as `0x${string}` });

export const checkTokenSafety = tool(async (args) => JSON.stringify(await safety.checkToken(args)), {
  name: "check_token_safety",
  description: "Rug check a token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana: 0-100 risk score with reasons.",
  schema: z.object({
    address: z.string(),
    chain: z.enum(["base", "eth", "arbitrum", "optimism", "polygon", "solana"]).optional(),
  }),
});
```

## Example output (trimmed)

```json
{
  "address": "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
  "chain": "base",
  "name": "Degen",
  "symbol": "DEGEN",
  "risk": {
    "score": 15,
    "level": "low",
    "reasons": [
      { "code": "can-pause", "points": 10, "text": "The owner can pause all transfers." },
      { "code": "owner-not-renounced", "points": 5, "text": "Ownership is not renounced." }
    ],
    "summary": "Low risk: the owner can pause all transfers; ownership is not renounced."
  },
  "market": { "dex": "uniswap-v3", "pairedWith": "WETH", "priceUsd": 0.000963, "quoteSideLiquidityUsd": 134000 },
  "watch": { "fingerprint": "eyJzIjoxNSwi…", "changes": null }
}
```

## Without this package

The check is a plain x402 endpoint, so any x402 client can call it directly:
`GET https://onchaincheck.dev/token?chain=<chain>&address=<address>[&since=<fingerprint>]`.
It's also listed in the [x402 Bazaar](https://agentic.market).

## Safety notes

- Use a dedicated wallet with a small balance. The key never leaves your machine; it only signs
  USDC payments of the quoted price.
- Each check's price is read from the server's payment request before paying, and anything above
  `maxUsdPerCheck` / `TOKEN_SAFETY_MAX_USD` is refused.

MIT licensed.
