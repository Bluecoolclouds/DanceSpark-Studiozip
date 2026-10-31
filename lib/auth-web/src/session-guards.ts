/** Never let an old request borrow credentials from the next browser session. */
export function guardedToken(
  readToken: () => Promise<string | null | undefined>,
  isCurrent: () => boolean,
): () => Promise<string | null> {
  return async () => {
    if (!isCurrent()) throw new Error("Сессия изменилась. Повтори действие.");
    const token = await readToken();
    if (!isCurrent()) throw new Error("Сессия изменилась. Повтори действие.");
    if (!token) throw new Error("Сессия истекла. Войди снова.");
    return token;
  };
}
