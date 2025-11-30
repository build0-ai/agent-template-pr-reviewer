import crypto from "crypto";

const ENCRYPTION_KEY =
  "4a25577e8b685fa7dd8add4b54aded0af277f2ea02bdbd536020db4f9b555747";
const ALGORITHM = "aes-256-gcm";
const CREDENTIALS_URL =
  "https://phisdev.staging.build0.ai/api/service/agents/692a35e2197969faa6c7a03b/credentials";
const AUTH_TOKEN = "temp-agent-token-12345";
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

/**
 * Centralized credential management service.
 * Fetches, decrypts, and caches credentials from remote API.
 * Provides a singleton instance that all parts of the framework can use.
 */
class CredentialManager {
  private credentials: Record<string, string> | null = null;
  private fetchPromise: Promise<Record<string, string>> | null = null;

  /**
   * Fetch credentials from remote API and cache them.
   * Ensures credentials are only fetched once even if called multiple times.
   */
  async fetchCredentials(): Promise<Record<string, string>> {
    // If already fetched, return cached credentials
    if (this.credentials !== null) {
      return this.credentials;
    }

    // If fetch is in progress, wait for it
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Start new fetch
    this.fetchPromise = this._performFetch();
    this.credentials = await this.fetchPromise;
    return this.credentials;
  }

  private async _performFetch(): Promise<Record<string, string>> {
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

  /**
   * Get cached credentials. Returns empty object if not yet fetched.
   */
  getCredentials(): Record<string, string> {
    return this.credentials || {};
  }

  /**
   * Require a specific credential to be present.
   * Throws if not found.
   */
  requireCredential(name: string): string {
    const value = this.credentials?.[name];
    if (!value) {
      throw new Error(
        `Required credential missing: ${name}. Did you forget to call fetchCredentials()?`
      );
    }
    return value;
  }
}

// Singleton instance
export const credentialManager = new CredentialManager();
