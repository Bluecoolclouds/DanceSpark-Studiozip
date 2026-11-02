import { clerkClient } from "@clerk/express";
import { pool, type PoolClient } from "@workspace/db";
import { ensureControls } from "./admin-data";
import { deleteOwnedCustomVideos } from "./custom-video-storage";

export const SOURCE_RETENTION_DAYS = 7;
export const JOB_RETENTION_DAYS = 30;
export const lifecycleLock = (id: string) => `account-lifecycle:${id}`;

export class AccountDeletionError extends Error {
  constructor(public readonly code: string, public readonly publicMessage: string) {
    super(code);
  }
}

/** Unacknowledged paid submissions are never equivalent to failed, unused work. */
export async function hasUnsettledWork(client: Pick<PoolClient, "query">, id: string): Promise<boolean> {
  const { rows } = await client.query(`
    SELECT 1 FROM df_jobs WHERE user_id=$1
      AND (status IN ('queued','running') OR error_code IN ('submission_unknown','timeout','billing_unconfirmed') OR credit_state='reserved')
    UNION ALL
    SELECT 1 FROM dance_video_generations WHERE owner_id=$1 AND state IN ('reserved','queued')
    LIMIT 1`, [id]);
  return rows.length > 0;
}

export async function requestDeletion(id: string): Promise<void> {
  await ensureControls();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Same lock order as a paid reservation; concurrent last-admin deletions serialize.
    await client.query("SELECT id FROM df_controls WHERE id=1 FOR UPDATE");
    const account = (await client.query("SELECT * FROM df_accounts WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!account) throw new AccountDeletionError("account_missing", "Аккаунт уже недоступен.");
    if (account.deletion_requested_at) { await client.query("COMMIT"); return; }
    if (await hasUnsettledWork(client, id)) {
      throw new AccountDeletionError("unsettled_generation",
        "Сначала дождись завершения генераций. Если результат отправки неизвестен, проверь статус задания или обратись в поддержку. Повторный платный запрос не нужен.");
    }
    if ((await client.query("SELECT 1 FROM df_auth_identities WHERE account_id=$1 LIMIT 1", [id])).rows.length) {
      // Logto is not enabled for the release. Never pretend its upstream identity was removed.
      throw new AccountDeletionError("linked_identity",
        "У аккаунта есть связанный вход Logto. Автоматическое удаление этого поставщика пока не подключено. Обратись в поддержку; удаление ещё не начато.");
    }
    if (account.role === "admin" && !(await client.query(
      "SELECT 1 FROM df_accounts WHERE role='admin' AND id<>$1 AND deletion_requested_at IS NULL AND blocked=false LIMIT 1",
      [id],
    )).rows.length) {
      throw new AccountDeletionError("last_administrator",
        "Сначала назначь другого действующего администратора. Последний администратор не может удалить аккаунт.");
    }
    await client.query("UPDATE df_accounts SET blocked=true,deletion_requested_at=now(),deletion_error=NULL WHERE id=$1", [id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function deletionStatus(id: string): Promise<"not_requested" | "pending" | "retrying" | "completed"> {
  const row = (await pool.query("SELECT deletion_requested_at,deletion_error FROM df_accounts WHERE id=$1", [id])).rows[0];
  return !row ? "completed" : !row.deletion_requested_at ? "not_requested" : row.deletion_error ? "retrying" : "pending";
}

async function deleteClerkIdentity(id: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      clerkClient.users.deleteUser(id),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("identity_cleanup_timeout")), 30000);
        timer.unref();
      }),
    ]);
  }
  catch (error) {
    // Retry after an acknowledged upstream deletion / a failed final DB commit.
    if ((error as { status?: number })?.status !== 404) throw error;
  } finally { if (timer) clearTimeout(timer); }
}

type DeletionDependencies = {
  deleteMedia: (id: string) => Promise<void>;
  deleteIdentity: (id: string) => Promise<void>;
};

/** Durable saga: a failure NEVER reactivates the account or reports completion. */
export async function processAccountDeletion(id: string, dependencies: DeletionDependencies = {
  deleteMedia: deleteOwnedCustomVideos,
  deleteIdentity: deleteClerkIdentity,
}): Promise<boolean> {
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [lifecycleLock(id)])).rows[0].locked;
    if (!locked) return false;
    const row = (await client.query("SELECT deletion_requested_at FROM df_accounts WHERE id=$1", [id])).rows[0];
    if (!row) return true;
    if (!row.deletion_requested_at) return false;
    if (await hasUnsettledWork(client, id)) throw new Error("unsettled");
    // Delete only the authenticated owner's private R2 prefix, never catalogue assets.
    await dependencies.deleteMedia(id);
    await dependencies.deleteIdentity(id);
    await client.query("BEGIN");
    await ensureControls();
    await client.query("SELECT id FROM df_controls WHERE id=1 FOR UPDATE");
    await client.query("SELECT id FROM df_accounts WHERE id=$1 FOR UPDATE", [id]);
    // Preserve the global spending guard without retaining an owner's identity.
    await client.query(`
      INSERT INTO df_erased_costs(day,cost_rub,unpriced)
      SELECT (created_at AT TIME ZONE 'UTC')::date,COALESCE(sum(estimated_cost_rub),0),
        count(*) FILTER (WHERE estimated_cost_rub IS NULL)::int
      FROM df_jobs WHERE user_id=$1 AND created_at>=now()-interval '30 days'
      GROUP BY (created_at AT TIME ZONE 'UTC')::date
      ON CONFLICT(day) DO UPDATE SET
        cost_rub=df_erased_costs.cost_rub+EXCLUDED.cost_rub,
        unpriced=df_erased_costs.unpriced+EXCLUDED.unpriced`, [id]);
    await client.query("DELETE FROM df_jobs WHERE user_id=$1", [id]);
    await client.query("DELETE FROM dance_video_generations WHERE owner_id=$1", [id]);
    await client.query("DELETE FROM df_auth_identities WHERE account_id=$1", [id]);
    await client.query("DELETE FROM df_admin_audit WHERE actor_id=$1 OR target_id=$1", [id]);
    await client.query("DELETE FROM df_accounts WHERE id=$1", [id]);
    await client.query("COMMIT");
    return true;
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    // Fixed category only: no vendor error, signed URL, email, or raw user data.
    await client.query("UPDATE df_accounts SET deletion_error='cleanup_retry_required' WHERE id=$1 AND deletion_requested_at IS NOT NULL", [id]);
    return false;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lifecycleLock(id)]);
    client.release();
  }
}
