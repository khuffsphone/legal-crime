#!/usr/bin/env node
/**
 * Octane Racer — Meshy MCP server (stdio).
 *
 * Exposes agentic Meshy generation tools: text_to_3d, image_to_3d,
 * text_to_texture, get_task, list_tasks, download_task. Enforces project canon
 * (GLB only, RAW output, isometric pipeline is downstream in Blender).
 *
 * The API key is read from MESHY_API_KEY (env or tools/meshy/.env) ONLY.
 * Progress/logs go to stderr; stdout is reserved for the MCP transport.
 *
 * Connect it from Claude Desktop with the snippet in
 * tools/meshy/claude_desktop_config.example.json.
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MeshyClient } from "../src/client.js";
import { API_KEY_ENV } from "../src/constants.js";
import { loadDotEnv } from "../src/env.js";
import { buildTools, TOOL_NAMES } from "./tools.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_NAME = "meshy-mcp-server";
const SERVER_VERSION = "0.1.0";

function stderr(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

function resolveDefaultOutDir(): string {
  if (process.env.MESHY_OUT_DIR) return path.resolve(process.env.MESHY_OUT_DIR);
  return path.resolve(process.cwd(), "assets/raw/meshy");
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === "--help" || arg === "-h") {
    process.stdout.write(
      `${SERVER_NAME} v${SERVER_VERSION}\n` +
        `MCP stdio server for Meshy AI. Tools: ${TOOL_NAMES.join(", ")}.\n\n` +
        `Env:\n  ${API_KEY_ENV}   (required) Meshy API key\n` +
        `  MESHY_OUT_DIR   (optional) default download dir for meshy_download_task\n` +
        `  MESHY_API_BASE  (optional) API base override\n\n` +
        `Run via stdio (no args) and connect from an MCP client.\n`,
    );
    return;
  }
  if (arg === "--version" || arg === "-v") {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }

  // Convenience: pick up a local .env from likely locations. Never overrides real env.
  loadDotEnv(path.resolve(SCRIPT_DIR, "..", ".env"));
  loadDotEnv(path.resolve(process.cwd(), ".env"));

  const apiKey = process.env[API_KEY_ENV];
  if (!apiKey) {
    stderr(
      `ERROR: ${API_KEY_ENV} is not set. Provide it via the MCP client's env config or tools/meshy/.env.`,
    );
    process.exit(1);
  }

  const client = new MeshyClient({ apiKey });
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const tools = buildTools(client, { defaultOutDir: resolveDefaultOutDir(), log: stderr });
  for (const tool of tools) {
    server.registerTool(tool.name, tool.config, tool.handler as never);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  stderr(`${SERVER_NAME} v${SERVER_VERSION} ready on stdio (${tools.length} tools).`);
}

main().catch((err: unknown) => {
  stderr(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
