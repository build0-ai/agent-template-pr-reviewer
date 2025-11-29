import { simpleGit } from 'simple-git';
import fs from 'fs/promises';

export async function cloneRepo(repoUrl: string, targetDir: string) {
  console.log(`[System] Cloning ${repoUrl} to ${targetDir}...`);
  
  // Ensure directory exists (or clean it)
  try {
    await fs.rm(targetDir, { recursive: true, force: true });
  } catch {}
  await fs.mkdir(targetDir, { recursive: true });

  const git = simpleGit();
  await git.clone(repoUrl, targetDir);
  console.log(`[System] Clone complete.`);
}



