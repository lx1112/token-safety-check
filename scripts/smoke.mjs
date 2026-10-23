// Smoke test: starts the MCP server over stdio like an MCP client would, lists its tools, and
// runs two checks (the second with since). Run against a testnet deployment with a test wallet:
//   X402_PRIVATE_KEY=0x... TOKEN_SAFETY_ENDPOINT=https://ca-tax-api.lxtap.workers.dev/token node scripts/smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["dist/mcp.js"], env: process.env });
const client = new Client({ name: "smoke", version: "0" });
await client.connect(transport);
console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));

const call = async (args) => {
  const r = await client.callTool({ name: "check_token_safety", arguments: args });
  const text = r.content[0].text;
  if (r.isError) return console.log("error:", text), null;
  const j = JSON.parse(text);
  console.log(`${j.chain} ${j.symbol}: ${j.risk.score} ${j.risk.level} | ${j.risk.summary} | changed: ${j.watch.changes?.anythingChanged ?? "n/a"}`);
  return j;
};
const first = await call({ address: process.argv[2] ?? "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" });
if (first) await call({ address: first.address, since: first.watch.fingerprint });
await client.close();
