import { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Base configuration provided to all plugins.
 * Contains credentials fetched from remote API.
 */
export interface BasePluginConfig {
  [key: string]: string | undefined;
}

/**
 * Generic plugin interface.
 * Each plugin should define its own TConfig interface with required keys.
 */
export interface McpPlugin<TConfig extends BasePluginConfig = BasePluginConfig> {
  name: string;
  config?: TConfig;
  init(config: TConfig): Promise<void>;
  registerTools(): Tool[];
  handleToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<{
    content: { type: string; text: string }[];
    isError?: boolean;
  }>;
}
