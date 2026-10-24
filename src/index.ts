// Client for the Token Risk Check x402 route: a 0-100 rug-check score with plain reasons for any
// token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana. Each check costs $0.01 in USDC on
// Base, paid from your own wallet with x402; nothing is charged for errors or invalid input.
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

export const DEFAULT_ENDPOINT = "https://onchaincheck.dev/token";
export const CHAINS = ["base", "eth", "arbitrum", "optimism", "polygon", "solana"] as const;
export type Chain = (typeof CHAINS)[number];

export interface CheckOptions {
  /** Token contract (EVM, 0x...) or mint (Solana, base58) address. */
  address: string;
  /** Defaults to solana for base58 addresses, otherwise base. */
  chain?: Chain;
  /** watch.fingerprint from an earlier check, to get what changed since then. */
  since?: string;
}

export interface ClientOptions {
  /** Private key of a wallet holding a little USDC on Base. Use a dedicated low-balance wallet. */
  privateKey: `0x${string}`;
  /** Refuse to pay more than this per check, in USD. Default 0.05. */
  maxUsdPerCheck?: number;
  /** Override the route URL (e.g. a testnet deployment). */
  endpoint?: string;
}

export interface RiskReason {
  code: string;
  points: number;
  text: string;
}

export interface TokenRisk {
  address: string;
  chain: Chain;
  name: string | null;
  symbol: string | null;
  risk: { score: number; level: "low" | "medium" | "high" | "critical"; reasons: RiskReason[]; summary: string };
  watch: { fingerprint: string; changes: Record<string, unknown> | null };
  [fact: string]: unknown;
}

export class TokenCheckError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// x402 v2 sends the price in a base64 JSON header on the 402 response.
function priceUsd(res: Response): number | null {
  const header = res.headers.get("payment-required");
  if (!header) return null;
  try {
    const req = JSON.parse(atob(header)) as { accepts?: { amount?: string; maxAmountRequired?: string }[] };
    const amount = req.accepts?.[0]?.amount ?? req.accepts?.[0]?.maxAmountRequired;
    return amount ? Number(amount) / 1e6 : null; // USDC has 6 decimals
  } catch {
    return null;
  }
}

export function createTokenSafetyClient(opts: ClientOptions) {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const cap = opts.maxUsdPerCheck ?? 0.05;
  const account = privateKeyToAccount(opts.privateKey);
  const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      { network: "eip155:8453", client: new ExactEvmScheme(account) },
      { network: "eip155:84532", client: new ExactEvmScheme(account) },
    ],
  });

  return {
    async checkToken({ address, chain, since }: CheckOptions): Promise<TokenRisk> {
      const url = new URL(endpoint);
      url.searchParams.set("address", address);
      if (chain) url.searchParams.set("chain", chain);
      if (since) url.searchParams.set("since", since);

      // Read the price first (free), so we never pay more than the cap.
      const quote = await fetch(url);
      if (quote.status === 402) {
        const price = priceUsd(quote);
        if (price === null) throw new TokenCheckError("Could not read the price from the payment request");
        if (price > cap) throw new TokenCheckError(`Price $${price} is above your cap of $${cap} per check`);
      } else if (!quote.ok) {
        throw new TokenCheckError(`Token check failed: HTTP ${quote.status}`, quote.status);
      }

      // A 402 after paying means the payment didn't settle (nothing was charged); retry once.
      let res = await paidFetch(url);
      if (res.status === 402) res = await paidFetch(url);
      const body = (await res.json().catch(() => null)) as (TokenRisk & { error?: string }) | null;
      if (!res.ok || !body) throw new TokenCheckError(body?.error ?? `Token check failed: HTTP ${res.status}`, res.status);
      return body;
    },
  };
}
