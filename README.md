# token-safety-check

[![Lumière PayCheck grade](https://lumierepaycheck.org/badge?url=https%3A%2F%2Fonchaincheck.dev%2Ftoken)](https://lumierepaycheck.org/e?url=https%3A%2F%2Fonchaincheck.dev%2Ftoken)

**Is this token safe?** A rug check for any token on **Base, Ethereum, Arbitrum, Optimism, Polygon
or Solana**, for AI agents and scripts. Each check returns:

- a **0–100 risk score** and level (low, medium, high, critical) with **plain-language reasons**:
  - who can mint, freeze, blacklist, pause or change fees
  - upgradeable contract code
  - Token-2022 permanent delegates, transfer fees and hooks
  - holder concentration
  - thin or missing liquidity
  - a deployer whose earlier tokens lost their liquidity, or who launches tokens in bulk
- the facts behind the score: owner, authorities, supply, top holders, pools, and the deployer's
  launch record when we saw the token launch;
- USD price and liquidity;
- a **fingerprint**. Pass it back as `since` and the next check tells you what changed: new risks,
  authority changes, liquidity or price moves. That makes it easy to monitor tokens on a schedule.

A **verdict** call turns the same facts into a grade (CLEAN, MID, SKETCHY or RUGGY), a one-liner, a
short take and a link to a share card, for chat replies and quests.

A **watchlist** call re-checks up to 5 tokens at once for the same $0.01, returning a compact entry
per token and one-line alerts for whatever changed since your last call.

Checks, verdicts and watchlist calls cost **$0.01 each in USDC on Base**, paid automatically with
[x402](https://x402.org) from a wallet you control. There's no account or API key. Errors and invalid
input are never charged, and a spending cap stops any call priced above your limit (default $0.05).

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

The server has three tools:

- `check_token_safety` (`address`, optional `chain` and `since`): the full check for one token.
- `token_verdict` (`address`, optional `chain`): a grade, one-liner, short take and share-card link.
- `watch_tokens` (`tokens`: up to 5 of `{ address, chain?, since? }`): re-checks them all in one paid
  call and, given each token's earlier fingerprint, reports what changed with one-line alerts.

Optional environment variables:

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

### A verdict for a chat reply

```ts
const v = await client.verdict({ address: "0xe468f13905669748bf312611b9ebcc8ccc6db5d9" });
console.log(v.grade, v.oneLiner); // SKETCHY Liquidity: two coins and a prayer
console.log(v.take, v.card);       // "$KTI: 60/100 risk. ..." and a signed share-card link
// Pass requestKey (8-128 letters, digits or _.:-) and a retry with the same key is never charged twice.
```

### Watch what you hold

```ts
let list = [
  { chain: "base", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" },
  { chain: "solana", address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
] as const;
let fingerprints: (string | undefined)[] = [];

// Every hour (or however often): one $0.01 call for the whole list.
const w = await client.watchlist(list.map((t, i) => ({ ...t, since: fingerprints[i] })));
for (const alert of w.alerts) console.log(alert); // e.g. "PEPINA (eth): risk 0 -> 30 (medium); liquidity -99.99%"
fingerprints = w.tokens.map((t) => t.fingerprint);
```

## Use it in the Vercel AI SDK or Mastra

`token-safety-check/ai` gives three ready tools (`checkTokenSafety`, `tokenVerdict`, `watchTokens`),
plain `{ description, inputSchema, execute }` objects that both take as `tools`:

```ts
import { generateText } from "ai";
import { createTokenSafetyClient } from "token-safety-check";
import { tokenSafetyTools } from "token-safety-check/ai";

const tools = tokenSafetyTools(createTokenSafetyClient({ privateKey: process.env.X402_PRIVATE_KEY as `0x${string}` }));
const { text } = await generateText({ model, tools, prompt: "Is 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed on Base safe to buy?" });
```

## Use it in ElizaOS

`token-safety-check/eliza` is an ElizaOS 1.x plugin with one action, `CHECK_TOKEN_SAFETY`. When a
message names a token address ("is 0x… on Base safe?", "rug check <mint>"), the agent replies with
the verdict and a share-card link.

```ts
import { tokenSafetyPlugin } from "token-safety-check/eliza";

export const character = {
  name: "trader",
  plugins: [tokenSafetyPlugin],
  settings: { secrets: { TOKEN_SAFETY_PRIVATE_KEY: process.env.TOKEN_SAFETY_PRIVATE_KEY } },
};
```

Settings: `TOKEN_SAFETY_PRIVATE_KEY` (a dedicated wallet with a little USDC on Base; falls back to
`X402_PRIVATE_KEY`), optional `TOKEN_SAFETY_MAX_USD` (default 0.05) and `TOKEN_SAFETY_ENDPOINT`.

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

Both are plain x402 endpoints, so any x402 client can call them directly:
`GET https://onchaincheck.dev/token?chain=<chain>&address=<address>[&since=<fingerprint>]` and
`GET https://onchaincheck.dev/watchlist?tokens=<chain>:<address>,...[&since=<fp>,...]`.
It's also listed in the [x402 Bazaar](https://agentic.market).

## Safety notes

- Use a dedicated wallet with a small balance. The key never leaves your machine; it only signs
  USDC payments of the quoted price.
- Each check's price is read from the server's payment request before paying, and anything above
  `maxUsdPerCheck` / `TOKEN_SAFETY_MAX_USD` is refused.

MIT licensed.
