// ElizaOS (1.x) plugin: a CHECK_TOKEN_SAFETY action that answers "is this token safe?" messages with
// a verdict (grade, one-liner, take, share card), paid from the agent's own wallet.
//
//   import { tokenSafetyPlugin } from "token-safety-check/eliza";
//   // character: plugins: [..., tokenSafetyPlugin]
//
// Settings (character secrets or env):
//   TOKEN_SAFETY_PRIVATE_KEY  a dedicated wallet with a little USDC on Base (falls back to X402_PRIVATE_KEY)
//   TOKEN_SAFETY_MAX_USD      optional: refuse checks priced above this (default 0.05)
//   TOKEN_SAFETY_ENDPOINT     optional: override the route URL
import { createTokenSafetyClient, TokenCheckError, type Chain, type TokenSafetyClient } from "./index.js";

// The parts of @elizaos/core's Action and Plugin types this plugin uses, declared here: the package's
// own .d.ts files don't resolve under NodeNext, and this keeps it free of a dependency. ElizaOS checks
// plugins structurally, so these objects fit its Plugin type.
interface IAgentRuntime {
  getSetting(key: string): string | boolean | number | null;
}
interface Memory {
  content: { text?: string; [key: string]: unknown };
}
interface Content {
  text?: string;
  actions?: string[];
  [key: string]: unknown;
}
interface ActionResult {
  success: boolean;
  text?: string;
  values?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: string | Error;
}
interface Action {
  name: string;
  similes?: string[];
  description: string;
  examples?: { name: string; content: Content }[][];
  validate: (runtime: IAgentRuntime, message: Memory, state?: unknown) => Promise<boolean>;
  handler: (
    runtime: IAgentRuntime,
    message: Memory,
    state?: unknown,
    options?: unknown,
    callback?: (response: Content) => Promise<unknown>,
  ) => Promise<ActionResult | void | undefined>;
  [key: string]: unknown;
}
interface Plugin {
  name: string;
  description: string;
  actions?: Action[];
}

const EVM = /\b0x[a-fA-F0-9]{40}\b/;
const SOLANA = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const CHAIN_WORDS: [RegExp, Chain][] = [
  [/\b(ethereum|eth mainnet|on eth)\b/i, "eth"],
  [/\barbitrum\b/i, "arbitrum"],
  [/\b(optimism|op mainnet)\b/i, "optimism"],
  [/\b(polygon|matic)\b/i, "polygon"],
  [/\bsolana\b/i, "solana"],
  [/\bbase\b/i, "base"],
];

/** The token address and chain named in a message, or null. */
export function tokenFromText(text: string): { address: string; chain?: Chain } | null {
  const evm = text.match(EVM)?.[0];
  const address = evm ?? text.match(SOLANA)?.[0];
  if (!address) return null;
  const chain = CHAIN_WORDS.find(([re]) => re.test(text))?.[1];
  // A Solana mint can't be on an EVM chain and vice versa; let the server infer in that case.
  if (!chain || (chain === "solana") !== !evm) return { address };
  return { address, chain };
}

const clients = new WeakMap<IAgentRuntime, TokenSafetyClient>();
function clientFor(runtime: IAgentRuntime): TokenSafetyClient | null {
  const hit = clients.get(runtime);
  if (hit) return hit;
  const key = String(runtime.getSetting("TOKEN_SAFETY_PRIVATE_KEY") ?? runtime.getSetting("X402_PRIVATE_KEY") ?? "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  const max = runtime.getSetting("TOKEN_SAFETY_MAX_USD");
  const endpoint = runtime.getSetting("TOKEN_SAFETY_ENDPOINT");
  const client = createTokenSafetyClient({
    privateKey: key as `0x${string}`,
    maxUsdPerCheck: max ? Number(max) : undefined,
    endpoint: endpoint ? String(endpoint) : undefined,
  });
  clients.set(runtime, client);
  return client;
}

export const checkTokenSafety: Action = {
  name: "CHECK_TOKEN_SAFETY",
  similes: ["RUG_CHECK", "TOKEN_VERDICT", "IS_TOKEN_SAFE", "CHECK_TOKEN_RISK"],
  description:
    "Rug check a token address on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana: grade (CLEAN, MID, SKETCHY or RUGGY), " +
    "risk score, the main risks and the creator's track record. Costs $0.01 in USDC on Base per check.",
  validate: async (runtime: IAgentRuntime, message: Memory) => Boolean(tokenFromText(message.content.text ?? "") && clientFor(runtime)),
  handler: async (runtime, message, _state, _options, callback): Promise<ActionResult> => {
    const token = tokenFromText(message.content.text ?? "");
    const client = clientFor(runtime);
    if (!token || !client) return { success: false, error: "No token address in the message, or TOKEN_SAFETY_PRIVATE_KEY is not set" };
    try {
      const v = await client.verdict(token);
      // The take already starts with the symbol and score.
      const text = `${v.grade} (${v.chain}): ${v.oneLiner}. ${v.take}${v.card ? `\nCard: ${v.card}` : ""}\n${v.disclaimer}`;
      await callback?.({ text, actions: ["CHECK_TOKEN_SAFETY"] });
      return { success: true, text, values: { tokenGrade: v.grade, tokenRiskScore: v.score }, data: { verdict: v } };
    } catch (e) {
      const text = e instanceof TokenCheckError ? e.message : `Token check failed: ${(e as Error).message}`;
      await callback?.({ text });
      return { success: false, text, error: text };
    }
  },
  examples: [
    [
      { name: "{{user1}}", content: { text: "Is 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed on Base safe to buy?" } },
      {
        name: "{{agent}}",
        content: { text: "CLEAN (base): Ships with an off switch. $DEGEN: 15/100 risk. ...", actions: ["CHECK_TOKEN_SAFETY"] },
      },
    ],
    [
      { name: "{{user1}}", content: { text: "rug check JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" } },
      { name: "{{agent}}", content: { text: "CLEAN (solana): ... $JUP: ...", actions: ["CHECK_TOKEN_SAFETY"] } },
    ],
  ],
};

export const tokenSafetyPlugin: Plugin = {
  name: "token-safety-check",
  description: "Rug checks for any token on six chains (onchaincheck.dev), paid per call over x402.",
  actions: [checkTokenSafety],
};

export default tokenSafetyPlugin;
