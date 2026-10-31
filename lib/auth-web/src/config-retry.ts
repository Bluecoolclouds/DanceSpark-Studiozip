/** Retry only the public, read-only configuration request; never fall back to an unverified login. */
export async function loadAuthConfigWithRetry<T>(
  request: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  { delays = [0, 400, 1200], timeoutMs = 6000 }: { delays?: number[]; timeoutMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; attempt < delays.length; attempt++) {
    signal.throwIfAborted();
    if (delays[attempt]) {
      await new Promise<void>((resolve, reject) => {
        const finish = () => { signal.removeEventListener('abort', cancel); resolve(); };
        const timer = setTimeout(finish, delays[attempt]);
        const cancel = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', cancel);
          reject(signal.reason);
        };
        signal.addEventListener('abort', cancel, { once: true });
      });
    }
    signal.throwIfAborted();
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('Auth configuration timed out')), timeoutMs);
    let rejectAborted = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', rejectAborted, { once: true });
    });
    try {
      return await Promise.race([request(controller.signal), aborted]);
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (signal.aborted || attempt === delays.length - 1 ||
        (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429)) {
        throw error;
      }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', rejectAborted);
    }
  }
  throw new Error('Auth configuration unavailable');
}
