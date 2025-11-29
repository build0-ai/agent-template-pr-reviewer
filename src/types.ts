import { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpPluginConfig {
  [key: string]: string | undefined;
}

export interface McpPlugin<TConfig extends McpPluginConfig = McpPluginConfig> {
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
