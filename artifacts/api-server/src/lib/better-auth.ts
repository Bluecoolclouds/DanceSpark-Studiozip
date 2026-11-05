import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { db, pool, authUser, authSession, authCredential, authVerification, authRateLimit } from "@workspace/db";
import { trustedWebOrigins } from "./web-origins";

const secret = process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET;
if (!secret || secret.length < 32) throw new Error("A session signing secret of at least 32 characters is required.");

export const BETTER_AUTH_ISSUER = "danceflow:better-auth";
export const auth = betterAuth({
  appName: "Danceflow",
  secret,
  basePath: "/api/auth",
  // Request-derived base URL is only accepted for the exact configured hosts.
  baseURL: {
    allowedHosts: trustedWebOrigins().map(origin => new URL(origin).host),
    protocol: "https",
    fallback: trustedWebOrigins()[0],
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: authUser, session: authSession, account: authCredential,
      verification: authVerification, rateLimit: authRateLimit },
    transaction: true,
  }),
  trustedOrigins: [...trustedWebOrigins(), "danceflow://"],
  emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128,
    requireEmailVerification: false, autoSignIn: true },
  emailVerification: { sendOnSignUp: false, sendOnSignIn: false },
  account: { accountLinking: { enabled: false } },
  user: { deleteUser: { enabled: false }, changeEmail: { enabled: false } },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false } },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 3600, max: 5 },
    } },
  advanced: {
    useSecureCookies: true,
    database: { generateId: () => randomUUID() },
    defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "lax" },
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
  },
  plugins: [expo(), bearer()],
  databaseHooks: {
    user: { create: {
      before: async user => {
        const email = user.email.trim().toLowerCase();
        const existing = await pool.query("SELECT 1 FROM df_accounts WHERE lower(email)=$1 LIMIT 1", [email]);
        if (existing.rowCount) throw new APIError("CONFLICT", {
          message: "Для существующего аккаунта нужен безопасный перенос доступа через оператора. Пароли Clerk/Logto автоматически не переносятся.",
        });
        return { data: { ...user, email, emailVerified: false } };
      },
      after: async user => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("INSERT INTO df_accounts(id,email) VALUES($1,$2)", [user.id, user.email]);
          await client.query("INSERT INTO df_auth_identities(issuer,subject,account_id) VALUES($1,$2,$2)",
            [BETTER_AUTH_ISSUER, user.id]);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
      },
    } },
  },
  // Do not log submitted credentials or raw provider errors.
  logger: { disabled: true },
});
