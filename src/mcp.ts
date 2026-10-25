#!/usr/bin/env node
// Local MCP server (stdio) with three tools, check_token_safety, token_verdict and watch_tokens, for Claude Desktop,
// Cursor and other MCP clients. It pays each call from the wallet in X402_PRIVATE_KEY.
//
// Environment:
//   X402_PRIVATE_KEY        required: a dedicated wallet with a little USDC on Base
//   TOKEN_SAFETY_MAX_USD    optional: refuse checks priced above this (default 0.05)
//   TOKEN_SAFETY_ENDPOINT   optional: override the route URL
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CHAINS, createTokenSafetyClient, TokenCheckError, WATCHLIST_MAX } from "./index.js";

const key = process.env.X402_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("token-safety-check: set X402_PRIVATE_KEY to a 0x-prefixed private key of a wallet with a little USDC on Base.");
  process.exit(1);
}
const max = process.env.TOKEN_SAFETY_MAX_USD ? Number(process.env.TOKEN_SAFETY_MAX_USD) : undefined;
const client = createTokenSafetyClient({ privateKey: key as `0x${string}`, maxUsdPerCheck: max, endpoint: process.env.TOKEN_SAFETY_ENDPOINT });

const server = new McpServer({ name: "token-safety-check", version: "0.4.0" });
server.tool(
  "check_token_safety",
  "Rug check a token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana: a 0-100 risk score with plain reasons " +
    "(mint, freeze, blacklist, fee or pause powers, upgradeable code, holder concentration, thin liquidity, a deployer whose earlier " +
    "tokens lost their liquidity), the facts behind it, and USD price and liquidity. Pass a previous watch.fingerprint as since to see " +
    "what changed. Costs $0.01 in USDC on Base per check.",
  {
    address: z.string().describe("Token contract (0x...) or Solana mint address"),
    chain: z.enum(CHAINS).optional().describe("Defaults to solana for base58 addresses, otherwise base"),
    since: z.string().optional().describe("watch.fingerprint from an earlier check"),
  },
  async (args) => {
    try {
      const result = await client.checkToken(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
    } catch (e) {
      return fail(e, "Token check");
    }
  },
);

const fail = (e: unknown, what: string) => ({
  content: [{ type: "text" as const, text: e instanceof TokenCheckError ? e.message : `${what} failed: ${(e as Error).message}` }],
  isError: true,
});

server.tool(
  "token_verdict",
  "A short verdict on a token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana: grade (CLEAN, MID, SKETCHY or RUGGY), " +
    "a one-liner, a take of up to 220 characters and a share card link, from the same risk score and creator record as " +
    "check_token_safety. Costs $0.01 in USDC on Base per verdict.",
  {
    address: z.string().describe("Token contract (0x...) or Solana mint address"),
    chain: z.enum(CHAINS).optional().describe("Defaults to solana for base58 addresses, otherwise base"),
  },
  async (args) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(await client.verdict(args)) }] };
    } catch (e) {
      return fail(e, "Verdict");
    }
  },
);

server.tool(
  "watch_tokens",
  `Re-check up to ${WATCHLIST_MAX} tokens (Base, Ethereum, Arbitrum, Optimism, Polygon or Solana) in one call: each token's 0-100 ` +
    "risk score, level, reason codes, price, liquidity and a fingerprint. Pass each token's fingerprint back as its since to get what " +
    "changed (new risks, owner or authority changes, liquidity or price moves of 10%+) and one-line alerts. Costs $0.01 in USDC on " +
    "Base per call, for the whole list.",
  {
    tokens: z
      .array(
        z.object({
          address: z.string().describe("Token contract (0x...) or Solana mint address"),
          chain: z.enum(CHAINS).optional().describe("Defaults to solana for base58 addresses, otherwise base"),
          since: z.string().optional().describe("This token's fingerprint from an earlier watch_tokens or check_token_safety call"),
        }),
      )
      .min(1)
      .max(WATCHLIST_MAX),
  },
  async ({ tokens }) => {
    try {
      return { content: [{ type: "text" as const, text: JSON.stringify(await client.watchlist(tokens)) }] };
    } catch (e) {
      return fail(e, "Watchlist");
    }
  },
);

await server.connect(new StdioServerTransport());
