#!/usr/bin/env node
// Calls one OnchainCheck route and pays for it with x402 (USDC on Base) from your own wallet.
//
//   node onchaincheck.mjs GET  "/token/quick?address=0x..."
//   node onchaincheck.mjs POST "/verdict" '{"tokenAddress":"0x..."}'
//
// Env:
//   X402_PRIVATE_KEY      private key of a dedicated, low-balance wallet holding a little USDC on Base (required)
//   ONCHAINCHECK_MAX_USD  refuse any call priced above this, in USD (default 0.05)
//   ONCHAINCHECK_URL      API host (default https://onchaincheck.dev; https://testnet.onchaincheck.dev
//                         takes Base Sepolia test USDC)
//
// It asks for the price first (free), refuses if it is above the cap, then pays and prints the JSON
// answer on stdout. The price paid goes to stderr. Errors (HTTP 4xx/5xx) are never charged.
// It sends User-Agent "onchaincheck-skill/<skill folder name>" so OnchainCheck can count use per skill.
// Needs: npm install @x402/fetch@2.28.0 @x402/evm@2.28.0 viem@2.57.8
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [method = "", path = "", body] = process.argv.slice(2);
const key = process.env.X402_PRIVATE_KEY;
const cap = Number(process.env.ONCHAINCHECK_MAX_USD ?? "0.05");
const host = (process.env.ONCHAINCHECK_URL ?? "https://onchaincheck.dev").replace(/\/$/, "");

function fail(message, code = 1) {
  console.error(`onchaincheck: ${message}`);
  process.exit(code);
}

if (!["GET", "POST"].includes(method.toUpperCase()) || !path.startsWith("/")) {
  fail('usage: node onchaincheck.mjs GET "/route?param=value"   or   node onchaincheck.mjs POST "/route" \'{"json":"body"}\'', 2);
}
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) fail("set X402_PRIVATE_KEY to the private key of a dedicated wallet (0x + 64 hex)", 2);
if (!(cap > 0)) fail("ONCHAINCHECK_MAX_USD must be a positive number", 2);

const url = host + path;
const skill = basename(dirname(dirname(fileURLToPath(import.meta.url)))).replace(/[^a-z0-9-]/g, "").slice(0, 40) || "unknown";
const headers = { "user-agent": `onchaincheck-skill/${skill}` };
const init =
  method.toUpperCase() === "POST"
    ? { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: body ?? "{}" }
    : { method: "GET", headers };

// x402 v2 puts the price in a base64 JSON header on the 402 response (amount in USDC base units, 6 decimals).
function priceUsd(res) {
  try {
    const req = JSON.parse(atob(res.headers.get("payment-required") ?? ""));
    const amount = req.accepts?.[0]?.amount ?? req.accepts?.[0]?.maxAmountRequired;
    return amount ? Number(amount) / 1e6 : null;
  } catch {
    return null;
  }
}

async function printAndExit(res) {
  const text = await res.text();
  let out = text;
  try {
    out = JSON.stringify(JSON.parse(text), null, 2);
  } catch {}
  if (!res.ok) fail(`HTTP ${res.status} (not charged): ${out.slice(0, 2000)}`);
  console.log(out);
  process.exit(0);
}

const quote = await fetch(url, init);
if (quote.status !== 402) await printAndExit(quote); // a free route, or an input error (not charged)

const price = priceUsd(quote);
if (price === null) fail("could not read the price from the 402 response");
if (price > cap) fail(`price $${price} is above your cap of $${cap} (raise ONCHAINCHECK_MAX_USD to allow it)`);

const account = privateKeyToAccount(key);
const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    { network: "eip155:8453", client: new ExactEvmScheme(account) },
    { network: "eip155:84532", client: new ExactEvmScheme(account) },
  ],
});

let res = await paidFetch(url, init);
// A 402 after paying means the payment didn't settle (nothing was charged): retry once.
if (res.status === 402) res = await paidFetch(url, init);
if (res.ok) console.error(`onchaincheck: paid $${price} from ${account.address}`);
await printAndExit(res);
