import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, ZodRawShape } from "zod";

/**
 * Base configuration provided to all plugins.
 * Contains credentials fetched from remote API.
 */
export interface BasePluginConfig {
  [key: string]: string | undefined;
}

/**
 * Tool definition with Zod schema for MCP SDK compatibility
 */
export interface ToolDefinition {
  name: string;
  description: string;
  zodSchema: z.ZodObject<ZodRawShape>;
}

/**
 * Generic plugin interface.
 * Each plugin should define its own TConfig interface with required keys.
 */
export interface McpPlugin<
  TConfig extends BasePluginConfig = BasePluginConfig
> {
  name: string;
  config?: TConfig;
  init(config: TConfig): Promise<void>;
  registerTools(): ToolDefinition[];
  handleToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult>;
}
