import fs from "fs/promises";

export interface WorkflowStep {
  id: string;
  type: "ai_agent" | "tool";
  tool?: string;
  args?: Record<string, any>;
  if?: string;
}

export interface Workflow {
  steps: WorkflowStep[];
}

export async function loadWorkflow(filePath: string): Promise<Workflow> {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}
