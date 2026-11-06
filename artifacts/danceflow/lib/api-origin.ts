export function nativeApiOrigin(input: {
  productionOrigin?: string;
  developmentDomain?: string;
  development: boolean;
}): string {
  const candidate = input.productionOrigin?.trim() ||
    (input.development && input.developmentDomain ? `https://${input.developmentDomain.trim()}` : '');
  if (!candidate) throw new Error('Для Android-релиза требуется EXPO_PUBLIC_API_ORIGIN с постоянным HTTPS-адресом API.');
  let url: URL;
  try { url = new URL(candidate); } catch { throw new Error('Некорректный адрес API.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Адрес API должен быть HTTPS-origin без пути, параметров и данных входа.');
  }
  const host = url.hostname.toLowerCase();
  if (!input.development && (
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.replit.dev') ||
    host.endsWith('.repl.co') || host.endsWith('.local') || host.endsWith('.internal') ||
    !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')
  )) throw new Error('Development-адрес или локальный сервер нельзя использовать в Android-релизе.');
  return url.origin;
}
