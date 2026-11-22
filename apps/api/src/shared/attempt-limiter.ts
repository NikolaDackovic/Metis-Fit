import { AppError } from './errors';

/**
 * Small in-memory sliding-window limiter for brute-force-sensitive actions keyed by user or IP
 * (e.g. entering link codes). Sufficient for a single API instance; move to Postgres when scaling out.
 */
export function createAttemptLimiter(opts: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    /** Records an attempt; throws RATE_LIMITED when the key exceeded the budget. */
    hit(key: string, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        throw new AppError('RATE_LIMITED', 'errors.rate_limited');
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= opts.windowMs)) hits.delete(k);
      }
    },
    reset: () => hits.clear(),
  };
}
