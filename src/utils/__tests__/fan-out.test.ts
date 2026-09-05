import { fanOut, type FanOutProcessorResult } from "../fan-out.js";

function fakeLogger() {
  return { log: jest.fn(), error: jest.fn() };
}

describe("fanOut", () => {
  it("records a not-configured processor result as skipped, not failed", async () => {
    const logger = fakeLogger();
    const processor = async (): Promise<FanOutProcessorResult> => ({
      status: "not_configured",
      reason: "no credentials",
    });

    const summary = await fanOut(["org-1"], processor, { logger });

    expect(summary.skipped).toEqual([{ item: "org-1", status: "skipped", reason: "no credentials" }]);
    expect(summary.succeeded).toEqual([]);
    expect(summary.failed).toEqual([]);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("org-1"));
  });

  it("isolates one item's thrown error from the rest", async () => {
    const logger = fakeLogger();
    const processor = async (item: string): Promise<FanOutProcessorResult> => {
      if (item === "org-2") throw new Error("boom");
      return { status: "success" };
    };

    const summary = await fanOut(["org-1", "org-2", "org-3"], processor, { logger });

    expect(summary.succeeded.map((r) => r.item)).toEqual(["org-1", "org-3"]);
    expect(summary.failed).toEqual([{ item: "org-2", status: "failed", reason: "boom" }]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("summarizes a mix of success, skip and failure counts", async () => {
    const processor = async (item: string): Promise<FanOutProcessorResult> => {
      if (item === "skip-me") return { status: "not_configured" };
      if (item === "fail-me") throw new Error("nope");
      return { status: "success" };
    };

    const summary = await fanOut(["ok-1", "skip-me", "fail-me", "ok-2"], processor);

    expect(summary.succeeded).toHaveLength(2);
    expect(summary.skipped).toHaveLength(1);
    expect(summary.failed).toHaveLength(1);
  });

  it("wraps a non-Error throw into a string reason", async () => {
    const processor = async (): Promise<FanOutProcessorResult> => {
      throw "raw string failure";
    };

    const summary = await fanOut(["org-1"], processor);

    expect(summary.failed).toEqual([{ item: "org-1", status: "failed", reason: "raw string failure" }]);
  });

  it("uses describeItem for the log line when provided", async () => {
    const logger = fakeLogger();
    const processor = async (): Promise<FanOutProcessorResult> => ({ status: "success" });

    await fanOut([{ organizationId: "abc", locationId: "def" }], processor, {
      logger,
      describeItem: (item) => `${item.organizationId}/${item.locationId}`,
    });

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("abc/def"));
  });
});
