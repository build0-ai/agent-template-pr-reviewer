import crypto from "crypto";

const ENCRYPTION_KEY =
  "4a25577e8b685fa7dd8add4b54aded0af277f2ea02bdbd536020db4f9b555747";
const ALGORITHM = "aes-256-gcm";
const CREDENTIALS_URL =
  "https://phisdev.staging.build0.ai/api/service/agents/692a35e2197969faa6c7a03b/credentials";
const AUTH_TOKEN = "temp-agent-token-12345";
// Using the same auth token as the AAD for simplicity based on the user's instruction,
// or maybe CREDENTIALS_AUTH_KEY is meant to be something else?
// The user snippet says: decipher.setAAD(Buffer.from(CREDENTIALS_AUTH_KEY));
// I will assume CREDENTIALS_AUTH_KEY is the same as the auth token used for the request unless specified otherwise,
// but looking at the prompt closely, it just says "set this header: x-agent-auth-token: temp-agent-token-12345"
// and later uses `CREDENTIALS_AUTH_KEY` in the decryption function without defining it.
// I'll define CREDENTIALS_AUTH_KEY as the token for now.
const CREDENTIALS_AUTH_KEY = "agent-credentials";

interface RemoteCredential {
  type: string;
  provider: string;
  apiKey?: string;
  access_token?: string;
  raw?: any;
}

function decryptCredentials(
  encryptedData: string
): Record<string, RemoteCredential> {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(CREDENTIALS_AUTH_KEY));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

export async function fetchAndDecryptCredentials(): Promise<
  Record<string, string>
> {
  console.log("[Credentials] Fetching remote credentials...");
  try {
    const response = await fetch(CREDENTIALS_URL, {
      headers: {
        "x-agent-auth-token": AUTH_TOKEN,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch credentials: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.encrypted) {
      throw new Error("Invalid response format: missing 'encrypted' field");
    }

    const rawCredentials = decryptCredentials(data.encrypted);
    console.log("[Credentials] Successfully decrypted credentials");

    // Transform to env var format
    const envVars: Record<string, string> = {};

    // Find provider credentials in the map
    for (const [key, cred] of Object.entries(rawCredentials)) {
      if (cred.provider === "sentry") {
        if (cred.apiKey) {
          envVars["SENTRY_AUTH_TOKEN"] = cred.apiKey;
          // Assuming organization and project need to be set manually or are also part of raw if provided
          // For now, we'll assume they are either in env or not provided by this mechanism.
          // However, the user provided structure doesn't show org/project.
          // We will persist existing env vars if they exist.
        }
      } else if (cred.provider === "slack") {
        if (cred.access_token) {
          envVars["SLACK_BOT_TOKEN"] = cred.access_token;
        }
      } else if (cred.provider === "github") {
        if (cred.access_token) {
          envVars["GITHUB_TOKEN"] = cred.access_token;
        }
      }
    }

    return envVars;
  } catch (error) {
    console.error(
      "[Credentials] Error fetching/decrypting credentials:",
      error
    );
    throw error;
  }
}
