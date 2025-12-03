import crypto from "crypto";
import { logger } from "../utils/logger.js";

const ENCRYPTION_KEY = process.env.BUILD0_ENCRYPTION_KEY!;
const ALGORITHM = "aes-256-gcm";
const CREDENTIALS_URL = process.env.BUILD0_AGENT_CREDENTIALS_URL!;
const AUTH_TOKEN = process.env.BUILD0_AGENT_AUTH_TOKEN!;
const CREDENTIALS_AUTH_KEY = "agent-credentials";

export interface Credential {
  type: string;
  provider: string;
  apiKey?: string;
  access_token?: string;
  raw?: any;
}

function decryptCredentials(encryptedData: string): Record<string, Credential> {
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
  private credentials: Record<string, Credential> | null = null;
  private fetchPromise: Promise<Record<string, Credential>> | null = null;

  /**
   * Fetch credentials from remote API and cache them.
   * Ensures credentials are only fetched once even if called multiple times.
   * Returns raw credentials - transformation to env vars happens in index.ts
   */
  async fetchCredentials(): Promise<Record<string, Credential>> {
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
    logger.info(
      `✅ Credentials fetched successfully:\n${Object.keys(this.credentials)
        .map((key) => `- ${key}`)
        .join("\n")}`
    );
    return this.credentials;
  }

  private async _performFetch(): Promise<Record<string, Credential>> {
    console.log("[Credentials] Fetching remote credentials...");
    try {
      const response = await fetch(CREDENTIALS_URL, {
        headers: { "x-agent-auth-token": AUTH_TOKEN },
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

      // Return raw credentials - transformation happens in index.ts
      return rawCredentials;
    } catch (error) {
      console.error(
        "[Credentials] Error fetching/decrypting credentials:",
        error
      );
      throw error;
    }
  }

  /**
   * Get cached raw credentials. Returns empty object if not yet fetched.
   */
  getCredentials(): Record<string, Credential> {
    return this.credentials || {};
  }
}

// Singleton instance
export const credentialManager = new CredentialManager();
