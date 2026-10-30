const fmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatInTimeZoneLite(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmt.format(d)} UTC`;
}
