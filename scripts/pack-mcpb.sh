#!/bin/sh
# Builds token-safety-check.mcpb (an MCP Bundle for Smithery and Claude Desktop) from dist/
# plus production dependencies. Run from the package folder after bumping the version in
# manifest.json along with package.json and server.json.
set -e
cd "$(dirname "$0")/.."
npm run build
rm -rf build/mcpb && mkdir -p build/mcpb
cp -R dist manifest.json package.json package-lock.json README.md LICENSE build/mcpb/
(cd build/mcpb && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
npx -y @anthropic-ai/mcpb@2.1.2 validate build/mcpb/manifest.json
npx -y @anthropic-ai/mcpb@2.1.2 pack build/mcpb token-safety-check.mcpb
