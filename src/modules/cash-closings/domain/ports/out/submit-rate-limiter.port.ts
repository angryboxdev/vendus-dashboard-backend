export interface SubmitRateLimiterPort {
  /** Returns true and records the attempt if this location is still under the limit; false if it's over. */
  checkAndRecord(locationId: string): boolean;
}
