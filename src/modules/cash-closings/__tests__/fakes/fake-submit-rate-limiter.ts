import type { SubmitRateLimiterPort } from "../../domain/ports/out/submit-rate-limiter.port.js";

export class FakeSubmitRateLimiter implements SubmitRateLimiterPort {
  denyAll = false;

  checkAndRecord(_locationId: string): boolean {
    return !this.denyAll;
  }
}
