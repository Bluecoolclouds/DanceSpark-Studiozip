import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { AuthFailure, createLogtoVerifier, logtoConfiguration } from "../src/lib/logto-auth";

const config = { endpoint: "https://auth.example.invalid/", issuer: "https://auth.example.invalid/oidc",
  resource: "urn:danceflow:api", webAppId: "test-web-client", adminAppId: "test-admin-client" };
let key: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let verifier: ReturnType<typeof createLogtoVerifier>;
before(async () => {
  const pair = await generateKeyPair("ES256");
  key = pair.privateKey;
  verifier = createLogtoVerifier(config, createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: "local" }] }));
});
function token(payload: Record<string, unknown> = {}, options: { audience?: string; issuer?: string; expired?: boolean } = {}) {
  return new SignJWT({ client_id: config.webAppId, ...payload })
    .setProtectedHeader({ alg: "ES256", kid: "local" }).setSubject(typeof payload.sub === "string" ? payload.sub : "logto-user")
    .setIssuer(options.issuer ?? config.issuer).setAudience(options.audience ?? config.resource)
    .setIssuedAt().setExpirationTime(options.expired ? Math.floor(Date.now() / 1000) - 30 : "5m").sign(key);
}
test("API accepts only verified, audience-restricted access tokens from approved web clients", async () => {
  const identity = await verifier.accessToken(await token());
  assert.equal(identity.subject, "logto-user");
  for (const invalid of [
    await token({}, { issuer: "https://attacker.example.invalid/oidc" }),
    await token({}, { audience: config.webAppId }), // ID tokens are not API credentials.
    await token({}, { expired: true }),
    await token({ client_id: "untrusted-client" }),
    await token({ sub: "" }),
    "not-a-jwt",
  ]) await assert.rejects(verifier.accessToken(invalid), (e: unknown) => e instanceof AuthFailure && e.status === 401);
});
test("identity proof must match access subject and client, and unverified email is never trusted", async () => {
  const principal = await verifier.accessToken(await token());
  const signedIdentity = (payload: Record<string, unknown>) => new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid: "local" }).setIssuer(config.issuer)
    .setAudience(config.webAppId).setIssuedAt().setExpirationTime("5m").sign(key);
  assert.equal(await verifier.identityToken(await signedIdentity({
    sub: principal.subject, email: "OWNER@EXAMPLE.INVALID", email_verified: true,
  }), principal), "owner@example.invalid");
  assert.equal(await verifier.identityToken(await signedIdentity({
    sub: principal.subject, email: "owner@example.invalid", email_verified: false,
  }), principal), null);
  await assert.rejects(verifier.identityToken(await signedIdentity({ sub: "someone-else" }), principal));
  await assert.rejects(verifier.identityToken(await token({}, { audience: config.adminAppId }), principal));
});
test("bad signatures and missing expiry are rejected", async () => {
  const other = await generateKeyPair("ES256");
  const forged = await new SignJWT({ client_id: config.webAppId }).setProtectedHeader({ alg: "ES256", kid: "local" })
    .setSubject("logto-user").setIssuer(config.issuer).setAudience(config.resource)
    .setIssuedAt().setExpirationTime("5m").sign(other.privateKey);
  await assert.rejects(verifier.accessToken(forged));
  const noExpiry = await new SignJWT({ client_id: config.webAppId }).setProtectedHeader({ alg: "ES256", kid: "local" })
    .setSubject("logto-user").setIssuer(config.issuer).setAudience(config.resource).setIssuedAt().sign(key);
  await assert.rejects(verifier.accessToken(noExpiry));
});
test("Logto requires explicit enablement and complete configuration", () => {
  delete process.env.LOGTO_AUTH_ENABLED;
  assert.equal(logtoConfiguration(), null);
  process.env.LOGTO_AUTH_ENABLED = "true";
  assert.throws(logtoConfiguration, (e: unknown) => e instanceof AuthFailure && e.status === 503);
  delete process.env.LOGTO_AUTH_ENABLED;
});
