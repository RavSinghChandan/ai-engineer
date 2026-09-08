import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
].join(" ");

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

let cached: { token: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function loadKey(keyPath: string): Promise<ServiceAccountKey> {
  const raw = await readFile(keyPath, "utf8");
  const key = JSON.parse(raw) as Partial<ServiceAccountKey>;
  if (!key.client_email || !key.private_key) {
    throw new Error(
      `Service account key at ${keyPath} is missing client_email or private_key.`,
    );
  }
  return key as ServiceAccountKey;
}

/**
 * Mints a short-lived access token by signing a JWT with the service account
 * key. Tokens are cached until 60s before expiry.
 */
export async function getAccessToken(keyPath: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const key = await loadKey(keyPath);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPES,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(key.private_key));
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Token exchange failed (${res.status}). Check that the key is valid and the Sheets + Drive APIs are enabled.`,
    );
  }

  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: body.access_token,
    expiresAt: now + body.expires_in,
  };
  return body.access_token;
}

export function resetTokenCache(): void {
  cached = null;
}
