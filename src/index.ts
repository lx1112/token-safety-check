// Client for the Token Risk Check x402 routes: a 0-100 rug-check score with plain reasons for any
// token on Base, Ethereum, Arbitrum, Optimism, Polygon or Solana (/token), and a watchlist that
// re-checks up to 5 tokens per call (/watchlist). Each call costs $0.01 in USDC on Base, paid from
// your own wallet with x402; nothing is charged for errors or invalid input.
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

export const DEFAULT_ENDPOINT = "https://onchaincheck.dev/token";
export const WATCHLIST_MAX = 5;
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

export interface WatchToken {
  /** Token contract (EVM, 0x...) or mint (Solana, base58) address. */
  address: string;
  /** Defaults to solana for base58 addresses, otherwise base. */
  chain?: Chain;
  /** fingerprint from this token's entry in an earlier watchlist (or /token) call. */
  since?: string;
}

export interface ClientOptions {
  /** Private key of a wallet holding a little USDC on Base. Use a dedicated low-balance wallet. */
  privateKey: `0x${string}`;
  /** Refuse to pay more than this per check, in USD. Default 0.05. */
  maxUsdPerCheck?: number;
  /** Override the route URL (e.g. a testnet deployment). The watchlist route is /watchlist on the same host. */
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
  /** Who launched the token and their record, when its launch was recorded (null otherwise). */
  deployer?: Record<string, unknown> | null;
  watch: { fingerprint: string; changes: Record<string, unknown> | null };
  [fact: string]: unknown;
}

export interface WatchEntry {
  chain: Chain;
  address: string;
  symbol?: string | null;
  score?: number;
  level?: "low" | "medium" | "high" | "critical";
  reasons?: string[];
  priceUsd?: number | null;
  liquidityUsd?: number | null;
  /** Send back as this token's since on the next call. */
  fingerprint?: string;
  changes?: (Record<string, unknown> & { anythingChanged: boolean }) | null;
  /** Set instead of the fields above when this token couldn't be checked. */
  error?: string;
}

export interface Watchlist {
  checkedAt: string;
  checked: number;
  changed: number;
  /** One line per token that changed, e.g. "PEPINA (eth): risk 0 -> 30 (medium); liquidity -99.99%". */
  alerts: string[];
  tokens: WatchEntry[];
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

  // Reads the price first (free), so we never pay more than the cap; a 402 after paying means the
  // payment didn't settle (nothing was charged), so it retries once.
  async function paidGet<T>(url: URL, what: string): Promise<T> {
    const quote = await fetch(url);
    if (quote.status === 402) {
      const price = priceUsd(quote);
      if (price === null) throw new TokenCheckError("Could not read the price from the payment request");
      if (price > cap) throw new TokenCheckError(`Price $${price} is above your cap of $${cap} per check`);
    } else if (!quote.ok) {
      const body = (await quote.json().catch(() => null)) as { error?: string } | null;
      throw new TokenCheckError(body?.error ?? `${what} failed: HTTP ${quote.status}`, quote.status);
    }
    let res = await paidFetch(url);
    if (res.status === 402) res = await paidFetch(url);
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !body) throw new TokenCheckError(body?.error ?? `${what} failed: HTTP ${res.status}`, res.status);
    return body;
  }

  return {
    async checkToken({ address, chain, since }: CheckOptions): Promise<TokenRisk> {
      const url = new URL(endpoint);
      url.searchParams.set("address", address);
      if (chain) url.searchParams.set("chain", chain);
      if (since) url.searchParams.set("since", since);
      return paidGet<TokenRisk>(url, "Token check");
    },

    /**
     * Re-checks up to 5 tokens in one $0.01 call. Keep each entry's fingerprint and pass it back as
     * that token's since: the next call reports what changed and lists alerts.
     */
    async watchlist(tokens: WatchToken[]): Promise<Watchlist> {
      if (!tokens.length || tokens.length > WATCHLIST_MAX) throw new TokenCheckError(`watchlist takes 1 to ${WATCHLIST_MAX} tokens`);
      const url = new URL("/watchlist", endpoint);
      url.searchParams.set("tokens", tokens.map((t) => (t.chain ? `${t.chain}:${t.address}` : t.address)).join(","));
      if (tokens.some((t) => t.since)) url.searchParams.set("since", tokens.map((t) => t.since ?? "").join(","));
      return paidGet<Watchlist>(url, "Watchlist");
    },
  };
}
