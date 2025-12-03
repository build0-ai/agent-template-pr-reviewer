// Log message types for structured agent progress tracking

import { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface BaseLogMessage {
  timestamp: string;
  level: LogLevel;
  type: string;
  stepId?: string;
  message?: string;
}

// Step execution messages
export interface StepStartMessage extends BaseLogMessage {
  type: "step_start";
  stepId: string;
  stepType: "ai_agent" | "tool";
  toolName?: string;
}

export interface StepCompleteMessage extends BaseLogMessage {
  type: "step_complete";
  stepId: string;
  duration?: number;
  outputPreview?: string;
}

export interface StepErrorMessage extends BaseLogMessage {
  type: "step_error";
  stepId: string;
  error: string;
}

export interface StepSkipMessage extends BaseLogMessage {
  type: "step_skip";
  stepId: string;
  reason: string;
}

// AI Agent messages
export interface AiAgentPromptMessage extends BaseLogMessage {
  type: "ai_agent_prompt";
  stepId: string;
  promptLength: number;
  truncated: boolean;
  fullPromptPath?: string;
}

export interface AiAgentResponseMessage extends BaseLogMessage {
  type: "ai_agent_response";
  stepId: string;
  responseLength: number;
  responsePreview: string;
}

// Tool execution messages
export interface ToolCallMessage extends BaseLogMessage {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
}

export interface ToolResultMessage extends BaseLogMessage {
  type: "tool_result";
  toolName: string;
  toolCallId: string;
  resultLength: number;
  resultPreview: string;
  hasJsonResult?: boolean;
}

// Claude Code sdk message
export interface ClaudeCodeSdkMessage extends BaseLogMessage {
  type: "claude_code_sdk";
  sdkMessage: SDKMessage;
}

// Claude Code stderr messages
export interface ClaudeCodeStderrMessage extends BaseLogMessage {
  type: "claude_code_stderr";
  stderr: string;
}

export interface GenericLogMessage extends BaseLogMessage {
  type: "log";
}

export type LogMessage =
  | StepStartMessage
  | StepCompleteMessage
  | StepErrorMessage
  | StepSkipMessage
  | AiAgentPromptMessage
  | AiAgentResponseMessage
  | ToolCallMessage
  | ToolResultMessage
  | ClaudeCodeSdkMessage
  | ClaudeCodeStderrMessage
  | GenericLogMessage;

// Extract all possible log message types for strong typing
export type LogMessageType = LogMessage["type"];

// Helper function to create typed log messages
export function createLogMessage<T extends LogMessage>(
  message: Omit<T, "timestamp">
): T {
  return {
    ...message,
    timestamp: new Date().toISOString(),
  } as unknown as T;
}
