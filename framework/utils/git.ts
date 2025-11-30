import { simpleGit } from "simple-git";
import fs from "fs/promises";

export async function cloneRepo(
  repoUrl: string,
  targetDir: string,
  config?: Record<string, string>
) {
  console.log(`[System] Cloning ${repoUrl} to ${targetDir}...`);

  // Inject GitHub token into URL if available
  let authenticatedUrl = repoUrl;
  const githubToken = config?.GITHUB_TOKEN;
  if (githubToken && repoUrl.includes("github.com")) {
    // Format: https://<token>@github.com/owner/repo.git
    authenticatedUrl = repoUrl.replace(
      /https:\/\/(github\.com\/)/,
      `https://${githubToken}@$1`
    );
    console.log(`[System] Using authenticated clone URL`);
  }

  // Ensure directory exists (or clean it)
  try {
    await fs.rm(targetDir, { recursive: true, force: true });
  } catch {}
  await fs.mkdir(targetDir, { recursive: true });

  const git = simpleGit();
  await git.clone(authenticatedUrl, targetDir);
  console.log(`[System] Clone complete.`);
}
