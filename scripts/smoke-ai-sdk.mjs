// Needs "ai" installed next to the package (npm i ai). Runs the registry code example through the AI SDK's real tool loop. A mock model stands in for the
// LLM (no API key here): step 1 calls tokenVerdict, step 2 answers from the tool result.
import { generateText, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createTokenSafetyClient } from "token-safety-check";
import { tokenSafetyTools } from "token-safety-check/ai";

const client = createTokenSafetyClient({
  privateKey: process.env.X402_PRIVATE_KEY,
  maxUsdPerCheck: 0.02,
  endpoint: process.env.TOKEN_SAFETY_ENDPOINT,
});
const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };
let step = 0;
const model = new MockLanguageModelV4({
  doGenerate: async (opts) => {
    step++;
    if (step === 1) {
      console.log("tools offered to the model:", opts.tools.map((t) => t.name).join(", "));
      return { content: [{ type: "tool-call", toolCallId: "c1", toolName: "tokenVerdict", input: JSON.stringify({ address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" }) }], finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] };
    }
    const result = opts.prompt.find((m) => m.role === "tool").content[0].output;
    return { content: [{ type: "text", text: `Verdict: ${JSON.stringify(result).slice(0, 160)}` }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] };
  },
});
const { text, steps } = await generateText({
  model,
  prompt: "Is the token 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed on Base safe to buy?",
  tools: tokenSafetyTools(client),
  stopWhen: isStepCount(3),
});
console.log("steps:", steps.length, "| tool result grade:", steps[0].toolResults[0]?.output?.grade);
console.log(text);
