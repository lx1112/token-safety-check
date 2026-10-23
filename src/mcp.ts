#!/usr/bin/env node
// Local MCP server (stdio) exposing one tool, check_token_safety, for Claude Desktop, Cursor and
// other MCP clients. It pays each check from the wallet in X402_PRIVATE_KEY.
//
// Environment:
//   X402_PRIVATE_KEY        required: a dedicated wallet with a little USDC on Base
//   TOKEN_SAFETY_MAX_USD    optional: refuse checks priced above this (default 0.05)
//   TOKEN_SAFETY_ENDPOINT   optional: override the route URL
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CHAINS, createTokenSafetyClient, TokenCheckError } from "./index.js";

const key = process.env.X402_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("token-safety-check: set X402_PRIVATE_KEY to a 0x-prefixed private key of a wallet with a little USDC on Base.");
  process.exit(1);
}
const max = process.env.TOKEN_SAFETY_MAX_USD ? Number(process.env.TOKEN_SAFETY_MAX_USD) : undefined;
const client = createTokenSafetyClient({ privateKey: key as `0x${string}`, maxUsdPerCheck: max, endpoint: process.env.TOKEN_SAFETY_ENDPOINT });

const server = new McpServer({ name: "token-safety-check", version: "0.1.0" });
server.tool(
  "check_token_safety",
  "Rug check a token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana: a 0-100 risk score with plain reasons " +
    "(mint, freeze, blacklist, fee or pause powers, upgradeable code, holder concentration, thin liquidity), the facts behind it, " +
    "and USD price and liquidity. Pass a previous watch.fingerprint as since to see what changed. Costs $0.01 in USDC on Base per check.",
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
      const message = e instanceof TokenCheckError ? e.message : `Token check failed: ${(e as Error).message}`;
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  },
);

await server.connect(new StdioServerTransport());
