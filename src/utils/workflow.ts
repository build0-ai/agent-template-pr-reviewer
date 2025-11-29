import fs from 'fs/promises';
import path from 'path';

export interface WorkflowStep {
  id: string;
  type: 'system' | 'ai_agent' | 'tool';
  action?: string;
  prompt?: string;
  tool?: string;
  args?: Record<string, any>;
  working_dir?: string;
  path?: string;
  if?: string;
}

export interface Workflow {
  name: string;
  target_repo: {
    url_env: string;
  };
  steps: WorkflowStep[];
}

export async function loadWorkflow(filePath: string): Promise<Workflow> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}



