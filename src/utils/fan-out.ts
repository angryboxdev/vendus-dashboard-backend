import { mapLimit } from "./mapLimit.js";

/**
 * The generic fan-out utility (spec C: "one shared utility" for both crons).
 * A per-item processor reports "not configured" as an explicit result
 * (skip, not error); anything it throws is a real per-item failure, caught
 * here and isolated from the rest of the run.
 */
export type FanOutProcessorResult = { status: "success" } | { status: "not_configured"; reason?: string };

export type FanOutItemStatus = "success" | "skipped" | "failed";

export interface FanOutItemResult<T> {
  item: T;
  status: FanOutItemStatus;
  reason?: string;
}

export interface FanOutSummary<T> {
  succeeded: FanOutItemResult<T>[];
  skipped: FanOutItemResult<T>[];
  failed: FanOutItemResult<T>[];
}

export interface FanOutOptions<T> {
  describeItem?: (item: T) => string;
  concurrency?: number;
  logger?: Pick<Console, "log" | "error">;
}

const DEFAULT_CONCURRENCY = 5;

function skippedResult<T>(item: T, reason?: string): FanOutItemResult<T> {
  return reason === undefined ? { item, status: "skipped" } : { item, status: "skipped", reason };
}

/**
 * Runs `processor` for every item independently. A "not configured" result
 * is recorded as skipped; any thrown error is caught, logged, and recorded
 * as failed without stopping the remaining items. The returned summary
 * buckets every item into succeeded / skipped / failed with enough detail
 * per item to log which one did what.
 */
export async function fanOut<T>(
  items: readonly T[],
  processor: (item: T) => Promise<FanOutProcessorResult>,
  options: FanOutOptions<T> = {},
): Promise<FanOutSummary<T>> {
  const describeItem = options.describeItem ?? ((item: T) => JSON.stringify(item));
  const logger = options.logger ?? console;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const results = await mapLimit(items as T[], concurrency, async (item): Promise<FanOutItemResult<T>> => {
    try {
      const outcome = await processor(item);
      if (outcome.status === "not_configured") {
        const suffix = outcome.reason ? `: ${outcome.reason}` : "";
        logger.log(`[fan-out] skipped ${describeItem(item)}${suffix}`);
        return skippedResult(item, outcome.reason);
      }
      logger.log(`[fan-out] succeeded ${describeItem(item)}`);
      return { item, status: "success" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(`[fan-out] failed ${describeItem(item)}: ${reason}`);
      return { item, status: "failed", reason };
    }
  });

  return {
    succeeded: results.filter((r) => r.status === "success"),
    skipped: results.filter((r) => r.status === "skipped"),
    failed: results.filter((r) => r.status === "failed"),
  };
}
