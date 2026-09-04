import type { SubmitRateLimiterPort } from "../../domain/ports/out/submit-rate-limiter.port.js";

/**
 * In-memory, fixed-window rate limiter for `submit`, keyed by `locationId`
 * (same style as kiosk's `scanRateMap`/`checkScanRateLimit`).
 *
 * 10 attempts / 5 minutes by default: legitimate submissions are ~1 per
 * location per shift, so this is generous for retries while still bounding
 * PIN-guessing attempts made through this endpoint.
 *
 * Unlike kiosk's map, no periodic cleanup interval is needed — `locationId`
 * cardinality is bounded to actually-paired locations in the org (not
 * attacker-controlled like an IP), so this map can't grow unboundedly.
 */
export class InMemorySubmitRateLimiter implements SubmitRateLimiterPort {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs = 5 * 60_000,
    private readonly limit = 10,
  ) {}

  checkAndRecord(locationId: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(locationId);
    if (!entry || now > entry.resetAt) {
      this.attempts.set(locationId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }
}
