// Smoke test for the 0.4 additions: client.verdict, the AI SDK tools and the ElizaOS action (with a
// stand-in runtime). Run against a testnet deployment with a test wallet:
//   X402_PRIVATE_KEY=0x... TOKEN_SAFETY_ENDPOINT=https://testnet.onchaincheck.dev/token node scripts/smoke-plugins.mjs
import { createTokenSafetyClient } from "../dist/index.js";
import { tokenSafetyTools } from "../dist/ai.js";
import { tokenSafetyPlugin, tokenFromText } from "../dist/eliza.js";

const settings = { TOKEN_SAFETY_PRIVATE_KEY: process.env.X402_PRIVATE_KEY, TOKEN_SAFETY_ENDPOINT: process.env.TOKEN_SAFETY_ENDPOINT };
const client = createTokenSafetyClient({ privateKey: settings.TOKEN_SAFETY_PRIVATE_KEY, endpoint: settings.TOKEN_SAFETY_ENDPOINT });

console.log("parse:", JSON.stringify(tokenFromText("is 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed on ethereum safe?")), JSON.stringify(tokenFromText("rug check JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN on base")), tokenFromText("hello"));

const v = await client.verdict({ address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", requestKey: `smoke-${Date.now()}` });
console.log("verdict:", v.symbol, v.grade, v.score, "|", v.oneLiner, "| card:", Boolean(v.card));

const tools = tokenSafetyTools(client);
const t = await tools.tokenVerdict.execute({ address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" });
console.log("ai tool:", t.symbol, t.chain, t.grade, "| schema ok:", tools.checkTokenSafety.inputSchema.safeParse({ address: "0xabc" }).success);

const runtime = { getSetting: (k) => settings[k] ?? null };
const action = tokenSafetyPlugin.actions[0];
const msg = { content: { text: "Is 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed on Base safe to buy?" } };
console.log("eliza validate:", await action.validate(runtime, msg), await action.validate(runtime, { content: { text: "gm" } }));
const r = await action.handler(runtime, msg, undefined, undefined, async (c) => console.log("eliza reply:", c.text.split("\n")[0]));
console.log("eliza result:", r.success, r.values);
