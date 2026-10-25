// Tools for the Vercel AI SDK (generateText, streamText, ToolLoopAgent) and Mastra, which takes the
// same shape. Each is a plain { description, inputSchema, execute } object, so this file needs no
// dependency on the "ai" package: pass the result straight to `tools`.
//
//   import { createTokenSafetyClient } from "token-safety-check";
//   import { tokenSafetyTools } from "token-safety-check/ai";
//   const tools = tokenSafetyTools(createTokenSafetyClient({ privateKey }));
//   await generateText({ model, tools, prompt: "Is 0x... on Base safe to buy?" });
import { z } from "zod";
import { CHAINS, WATCHLIST_MAX, type TokenSafetyClient } from "./index.js";

const address = z.string().describe("Token contract (0x...) or Solana mint address");
const chain = z.enum(CHAINS).optional().describe("Defaults to solana for base58 addresses, otherwise base");

export function tokenSafetyTools(client: TokenSafetyClient) {
  return {
    checkTokenSafety: {
      description:
        "Rug check a token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana: a 0-100 risk score with plain reasons " +
        "(mint, freeze, blacklist, fee or pause powers, upgradeable code, holder concentration, thin liquidity, a deployer whose " +
        "earlier tokens lost their liquidity), the facts behind it, and USD price and liquidity. Costs $0.01 in USDC on Base.",
      inputSchema: z.object({ address, chain, since: z.string().optional().describe("watch.fingerprint from an earlier check") }),
      execute: (args: { address: string; chain?: (typeof CHAINS)[number]; since?: string }) => client.checkToken(args),
    },
    tokenVerdict: {
      description:
        "A short verdict on a token: grade (CLEAN, MID, SKETCHY or RUGGY), a one-liner, a take of up to 220 characters and a " +
        "share card link, from the same risk score and creator record. Costs $0.01 in USDC on Base.",
      inputSchema: z.object({ address, chain }),
      execute: (args: { address: string; chain?: (typeof CHAINS)[number] }) => client.verdict(args),
    },
    watchTokens: {
      description:
        `Re-check up to ${WATCHLIST_MAX} tokens in one call: score, level, reasons, price, liquidity and a fingerprint each. ` +
        "Pass a token's fingerprint back as its since to get what changed and one-line alerts. Costs $0.01 in USDC on Base per call.",
      inputSchema: z.object({
        tokens: z.array(z.object({ address, chain, since: z.string().optional() })).min(1).max(WATCHLIST_MAX),
      }),
      execute: ({ tokens }: { tokens: { address: string; chain?: (typeof CHAINS)[number]; since?: string }[] }) => client.watchlist(tokens),
    },
  };
}
