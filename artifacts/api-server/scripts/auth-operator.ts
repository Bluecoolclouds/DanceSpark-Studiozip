/**
 * Trusted-terminal procedure, never an HTTP endpoint.
 * Ownership must be checked by the operator outside this tool.
 * Password is read silently from the terminal, never from argv or logs.
 */
import { randomUUID } from "node:crypto";
import { emitKeypressEvents } from "node:readline";
import { hashPassword } from "better-auth/crypto";
import { pool } from "@workspace/db";

async function password(): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Run in an interactive trusted terminal.");
  process.stdout.write("Новый пароль (10–128 символов, ввод скрыт): ");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const onKey = (text: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") { finish(); reject(new Error("Отменено")); return; }
      if (key.name === "return") { finish(); resolve(value); return; }
      if (key.name === "backspace") value = value.slice(0, -1);
      else if (!key.ctrl && text && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    };
    function finish() {
      process.stdin.off("keypress", onKey); process.stdin.setRawMode(false); process.stdin.pause();
      process.stdout.write("\n");
    }
    process.stdin.on("keypress", onKey);
  });
}
const [command, id, confirmation] = process.argv.slice(2);
try {
  if (!["migrate", "grant-owner"].includes(command) || !id || confirmation !== "--ownership-verified") {
    throw new Error("Usage: pnpm --filter @workspace/api-server auth:operator migrate|grant-owner <internal-account-id> --ownership-verified");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('danceflow-auth-operator'))");
    const account = (await client.query("SELECT * FROM df_accounts WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!account || account.blocked || account.deletion_requested_at) throw new Error("Аккаунт недоступен.");
    if (command === "grant-owner") {
      const linked = await client.query("SELECT 1 FROM df_auth_identities WHERE account_id=$1 AND issuer='danceflow:better-auth'", [id]);
      if (!linked.rowCount) throw new Error("Сначала перенеси или зарегистрируй вход Better Auth.");
      await client.query("UPDATE df_accounts SET role='admin' WHERE id=$1", [id]);
      await client.query("INSERT INTO df_admin_audit(id,actor_id,action,target_id,details) VALUES($1,$2,'owner.operator',$2,'Оператор подтвердил владение аккаунтом')", [randomUUID(), id]);
    } else {
      const email = account.email.trim().toLowerCase();
      if (!email) throw new Error("У старого аккаунта нет email; нужна отдельная проверка оператором.");
      const exists = await client.query("SELECT 1 FROM df_auth_user WHERE lower(email)=$1", [email]);
      const linked = await client.query("SELECT 1 FROM df_auth_identities WHERE issuer='danceflow:better-auth' AND account_id=$1", [id]);
      if (exists.rowCount || linked.rowCount) throw new Error("Вход уже существует. Автоматическое объединение или перезапись запрещены.");
      const value = await password();
      if (value.length < 10 || value.length > 128) throw new Error("Длина пароля должна быть 10–128 символов.");
      const digest = await hashPassword(value);
      const subject = randomUUID();
      await client.query(`INSERT INTO df_auth_user(id,name,email,email_verified) VALUES($1,'Танцор',$2,false)`, [subject, email]);
      await client.query(`INSERT INTO df_auth_credential(id,user_id,account_id,provider_id,password)
        VALUES($1,$2,$2,'credential',$3)`, [randomUUID(), subject, digest]);
      await client.query("INSERT INTO df_auth_identities(issuer,subject,account_id) VALUES('danceflow:better-auth',$1,$2)", [subject, id]);
      await client.query("INSERT INTO df_admin_audit(id,actor_id,action,target_id,details) VALUES($1,$2,'auth.operator-migration',$2,'Оператор подтвердил владение; прежние ID и права сохранены')", [randomUUID(), id]);
    }
    await client.query("COMMIT");
    process.stdout.write("Готово. Учётные данные и адрес почты не выводятся. SMTP не настроен.\n");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
} catch (error) {
  // Controlled messages only; SQL errors can contain private data.
  const message = error instanceof Error && !("code" in error) ? error.message : "Операция не выполнена; проверь конфигурацию и ограничения базы.";
  process.stderr.write(`${message}\n`); process.exitCode = 1;
} finally { await pool.end(); }
