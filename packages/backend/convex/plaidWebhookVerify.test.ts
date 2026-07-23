import { describe, it, expect } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import { sha256Hex, verifyPlaidWebhook } from "./plaidWebhookVerify";

// Build a signed Plaid-Verification-style JWS over a given body.
async function signToken(opts: {
  privateKey: CryptoKey;
  bodyHash: string;
  kid?: string;
  alg?: string;
  iatSec?: number;
}) {
  const jwt = new SignJWT({ request_body_sha256: opts.bodyHash })
    .setProtectedHeader({ alg: opts.alg ?? "ES256", kid: opts.kid ?? "key-1" })
    .setIssuedAt(opts.iatSec);
  return jwt.sign(opts.privateKey);
}

describe("verifyPlaidWebhook", () => {
  const rawBody = JSON.stringify({
    webhook_type: "TRANSACTIONS",
    webhook_code: "SYNC_UPDATES_AVAILABLE",
    item_id: "item-abc",
  });

  async function freshKeys() {
    const { publicKey, privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    return { pubJwk: await exportJWK(publicKey), privateKey };
  }

  it("accepts a valid token whose body hash matches", async () => {
    const { pubJwk, privateKey } = await freshKeys();
    const token = await signToken({
      privateKey,
      bodyHash: await sha256Hex(rawBody),
    });
    const res = await verifyPlaidWebhook({
      token,
      rawBody,
      fetchKey: async () => pubJwk,
    });
    expect(res).toEqual({ ok: true });
  });

  it("rejects when the body was tampered (hash mismatch)", async () => {
    const { pubJwk, privateKey } = await freshKeys();
    const token = await signToken({
      privateKey,
      bodyHash: await sha256Hex(rawBody),
    });
    const res = await verifyPlaidWebhook({
      token,
      rawBody: rawBody + " ", // one byte changed
      fetchKey: async () => pubJwk,
    });
    expect(res).toEqual({ ok: false, reason: "body hash mismatch" });
  });

  it("rejects a token signed by a different key", async () => {
    const { privateKey } = await freshKeys();
    const { pubJwk: otherPub } = await freshKeys();
    const token = await signToken({
      privateKey,
      bodyHash: await sha256Hex(rawBody),
    });
    const res = await verifyPlaidWebhook({
      token,
      rawBody,
      fetchKey: async () => otherPub,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a missing header", async () => {
    const res = await verifyPlaidWebhook({
      token: null,
      rawBody,
      fetchKey: async () => ({}) as JWK,
    });
    expect(res).toEqual({
      ok: false,
      reason: "missing Plaid-Verification header",
    });
  });

  it("rejects an expired token (iat older than maxAge)", async () => {
    const { pubJwk, privateKey } = await freshKeys();
    const token = await signToken({
      privateKey,
      bodyHash: await sha256Hex(rawBody),
      iatSec: Math.floor(Date.now() / 1000) - 10_000,
    });
    const res = await verifyPlaidWebhook({
      token,
      rawBody,
      fetchKey: async () => pubJwk,
      maxAgeSec: 300,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a non-ES256 alg without ever fetching a key", async () => {
    let fetched = false;
    const token = await new SignJWT({
      request_body_sha256: await sha256Hex(rawBody),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .sign(new Uint8Array(32));
    const res = await verifyPlaidWebhook({
      token,
      rawBody,
      fetchKey: async () => {
        fetched = true;
        return {} as JWK;
      },
    });
    expect(res).toEqual({ ok: false, reason: "unexpected alg HS256" });
    expect(fetched).toBe(false);
  });
});
