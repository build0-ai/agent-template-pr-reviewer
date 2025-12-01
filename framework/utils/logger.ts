import { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  LogMessage,
  LogLevel,
  StepStartMessage,
  StepCompleteMessage,
  StepErrorMessage,
  StepSkipMessage,
  AiAgentPromptMessage,
  AiAgentResponseMessage,
  ToolCallMessage,
  ToolResultMessage,
  ClaudeCodeStderrMessage,
  McpServerCreatedMessage,
  ClaudeCodeSdkMessage,
} from "../core/log-types.js";

// Logger utility for structured JSON logging
class Logger {
  private currentStepId: string | null = null;
  private originalConsoleLog: typeof console.log;
  private originalConsoleWarn: typeof console.warn;
  private originalConsoleError: typeof console.error;
  private originalConsoleDebug: typeof console.debug;

  constructor() {
    // Store original console methods
    this.originalConsoleLog = console.log.bind(console);
    this.originalConsoleWarn = console.warn.bind(console);
    this.originalConsoleError = console.error.bind(console);
    this.originalConsoleDebug = console.debug.bind(console);

    // Override console methods to automatically include step ID
    this.overrideConsole();
  }

  private overrideConsole() {
    const self = this;

    console.log = (...args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      self.info(message);
    };

    console.warn = (...args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      self.warn(message);
    };

    console.error = (...args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      self.error(message);
    };

    console.debug = (...args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      self.debug(message);
    };
  }

  private log(message: LogMessage) {
    // Use original console.log to avoid recursion
    this.originalConsoleLog(JSON.stringify(message));
  }

  private createMessage<T extends LogMessage>(
    type: T["type"],
    level: LogLevel,
    data?: Partial<Omit<T, "type" | "level" | "timestamp">>
  ): T {
    return {
      timestamp: new Date().toISOString(),
      level,
      type,
      ...data,
    } as T;
  }

  stepStart(stepId: string, stepType: "ai_agent" | "tool", toolName?: string) {
    this.currentStepId = stepId;
    this.log(
      this.createMessage<StepStartMessage>("step_start", "info", {
        stepId,
        stepType,
        toolName,
      })
    );
  }

  stepComplete(stepId: string, duration?: number, outputPreview?: string) {
    this.log(
      this.createMessage<StepCompleteMessage>("step_complete", "info", {
        stepId,
        duration,
        outputPreview,
      })
    );
    this.currentStepId = null;
  }

  stepError(stepId: string, error: string) {
    this.log(
      this.createMessage<StepErrorMessage>("step_error", "error", {
        stepId,
        error,
      })
    );
    this.currentStepId = null;
  }

  stepSkip(stepId: string, reason: string) {
    this.log(
      this.createMessage<StepSkipMessage>("step_skip", "warn", {
        stepId,
        reason,
      })
    );
    this.currentStepId = null;
  }

  aiAgentPrompt(
    stepId: string,
    promptLength: number,
    truncated: boolean,
    fullPromptPath?: string
  ) {
    this.log(
      this.createMessage<AiAgentPromptMessage>("ai_agent_prompt", "info", {
        stepId,
        promptLength,
        truncated,
        fullPromptPath,
      })
    );
  }

  aiAgentResponse(
    stepId: string,
    responseLength: number,
    responsePreview: string
  ) {
    this.log(
      this.createMessage<AiAgentResponseMessage>("ai_agent_response", "info", {
        stepId,
        responseLength,
        responsePreview,
      })
    );
  }

  toolCall(toolName: string, args: Record<string, any>) {
    this.log(
      this.createMessage<ToolCallMessage>("tool_call", "info", {
        toolName,
        args,
      })
    );
  }

  toolResult(
    toolName: string,
    resultLength: number,
    resultPreview: string,
    hasJsonResult?: boolean
  ) {
    this.log(
      this.createMessage<ToolResultMessage>("tool_result", "info", {
        toolName,
        resultLength,
        resultPreview,
        hasJsonResult,
      })
    );
  }

  claudeCodeSdkMessage(message: SDKMessage) {
    this.log(
      this.createMessage<ClaudeCodeSdkMessage>("claude_code_sdk", "info", {
        sdkMessage: message,
      })
    );
  }

  claudeCodeStderr(stderr: string) {
    this.log(
      this.createMessage<ClaudeCodeStderrMessage>(
        "claude_code_stderr",
        "error",
        { stderr }
      )
    );
  }

  mcpServerCreated(
    serverName: string,
    serverVersion: string,
    serverTools: string[]
  ) {
    this.log(
      this.createMessage<McpServerCreatedMessage>(
        "mcp_server_created",
        "info",
        { serverName, serverVersion, serverTools }
      )
    );
  }

  // Generic log methods that automatically include current step ID
  info(message: string, data?: Record<string, any>) {
    this.log({
      timestamp: new Date().toISOString(),
      level: "info",
      type: "log",
      message,
      stepId: this.currentStepId ?? undefined,
      ...data,
    });
  }

  warn(message: string, data?: Record<string, any>) {
    this.log({
      timestamp: new Date().toISOString(),
      level: "warn",
      type: "log",
      message,
      stepId: this.currentStepId ?? undefined,
      ...data,
    });
  }

  error(message: string, data?: Record<string, any>) {
    this.log({
      timestamp: new Date().toISOString(),
      level: "error",
      type: "log",
      message,
      stepId: this.currentStepId ?? undefined,
      ...data,
    });
  }

  debug(message: string, data?: Record<string, any>) {
    this.log({
      timestamp: new Date().toISOString(),
      level: "debug",
      type: "log",
      message,
      stepId: this.currentStepId ?? undefined,
      ...data,
    });
  }
}

export const logger = new Logger();
