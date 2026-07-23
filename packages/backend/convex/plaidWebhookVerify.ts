// Verify Plaid's `Plaid-Verification` header on incoming webhooks.
//
// Plaid signs every production/development webhook with a compact JWS (ES256).
// Sandbox webhooks are UNSIGNED, so the caller gates enforcement on the
// deployment's Plaid environment (see http.ts). Flow, per Plaid docs:
//   1. The header is a JWS; its `kid` selects a verification key fetched from
//      POST /webhook_verification_key/get (an EC P-256 public JWK).
//   2. Verify the JWS signature with that key (ES256 only — reject alg swaps).
//   3. The JWT body carries `request_body_sha256` (hex SHA-256 of the RAW body)
//      and `iat` — compare the hash and bound the age to block replays.
//
// Kept free of Convex imports so the logic is unit-testable (see the .test.ts):
// the key lookup is injected via `fetchKey`, and crypto runs on Web Crypto
// (present in both the Convex runtime and Node 18+/vitest).
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function verifyPlaidWebhook(opts: {
  token: string | null;
  rawBody: string;
  fetchKey: (keyId: string) => Promise<JWK>;
  maxAgeSec?: number;
}): Promise<VerifyResult> {
  const { token, rawBody, fetchKey, maxAgeSec = 300 } = opts;
  if (!token) return { ok: false, reason: "missing Plaid-Verification header" };

  let kid: string | undefined;
  let alg: string | undefined;
  try {
    const header = decodeProtectedHeader(token);
    kid = header.kid;
    alg = header.alg;
  } catch {
    return { ok: false, reason: "malformed JWT header" };
  }
  // Pin ES256 — never trust the token's alg to pick the verification method
  // (guards against alg-confusion / "none" downgrade attacks).
  if (alg !== "ES256") return { ok: false, reason: `unexpected alg ${alg}` };
  if (!kid) return { ok: false, reason: "missing kid" };

  let key: Awaited<ReturnType<typeof importJWK>>;
  try {
    key = await importJWK(await fetchKey(kid), "ES256");
  } catch (e) {
    return { ok: false, reason: `key fetch/import failed: ${String(e)}` };
  }

  let payload: Record<string, unknown>;
  try {
    const res = await jwtVerify(token, key, {
      algorithms: ["ES256"],
      maxTokenAge: `${maxAgeSec}s`, // requires + bounds `iat` → replay guard
    });
    payload = res.payload as Record<string, unknown>;
  } catch (e) {
    return { ok: false, reason: `signature/claims invalid: ${String(e)}` };
  }

  const claimed = payload["request_body_sha256"];
  if (typeof claimed !== "string") {
    return { ok: false, reason: "missing request_body_sha256" };
  }
  const actual = await sha256Hex(rawBody);
  if (actual.length !== claimed.length || !timingSafeEqual(actual, claimed)) {
    return { ok: false, reason: "body hash mismatch" };
  }
  return { ok: true };
}

// Length-independent compare over equal-length hex strings — avoids leaking the
// match position via early exit.
function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
