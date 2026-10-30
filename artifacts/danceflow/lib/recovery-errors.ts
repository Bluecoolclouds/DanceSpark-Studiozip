/** Never display raw provider messages, which can reveal whether an email exists. */
export function recoveryError(error: unknown): string {
  const value = error as { code?: string; errors?: { code?: string }[]; status?: number } | null;
  const code = value?.errors?.[0]?.code ?? value?.code ?? '';
  if (value?.status === 429 || /rate_limit|too_many|too_much|verification_max_attempts/.test(code))
    return 'Слишком много попыток. Подожди несколько минут и попробуй снова.';
  if (/verification_expired|form_code_expired/.test(code))
    return 'Срок действия кода истёк. Запроси новый код.';
  if (/form_code_incorrect|verification_failed/.test(code))
    return 'Код не подошёл. Проверь письмо или запроси новый код.';
  if (/password_pwned|password_not_strong|password_length|password_size|password_validation|password_no_lowercase|password_no_uppercase|password_no_number|password_no_special/.test(code))
    return 'Выбери более надёжный пароль: не менее 8 символов, не из известных утечек.';
  if (/identifier_not_found|identification_not_found|strategy_for_user_invalid|password_reset_not_allowed|factor_not_found/.test(code))
    return 'Не удалось начать восстановление. Проверь адрес. Если регистрировались через Google, используй «Продолжить с Google» на экране входа.';
  if (/form_identifier|form_param_format|form_param_nil/.test(code))
    return 'Проверь формат электронной почты и заполни все поля.';
  if (/expired|not_found|invalid_state/.test(code))
    return 'Попытка восстановления завершилась. Начни заново и запроси новый код.';
  return 'Не удалось выполнить действие. Проверь подключение и попробуй ещё раз.';
}
