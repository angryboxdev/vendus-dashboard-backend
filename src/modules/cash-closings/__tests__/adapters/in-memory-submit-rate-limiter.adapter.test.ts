import { InMemorySubmitRateLimiter } from "../../adapters/out/in-memory-submit-rate-limiter.adapter.js";

describe("InMemorySubmitRateLimiter", () => {
  it("allows up to the limit", () => {
    const limiter = new InMemorySubmitRateLimiter(50, 2);

    expect(limiter.checkAndRecord("loc-1")).toBe(true);
    expect(limiter.checkAndRecord("loc-1")).toBe(true);
  });

  it("denies the attempt past the limit", () => {
    const limiter = new InMemorySubmitRateLimiter(50, 2);

    limiter.checkAndRecord("loc-1");
    limiter.checkAndRecord("loc-1");

    expect(limiter.checkAndRecord("loc-1")).toBe(false);
  });

  it("resets after the window elapses", async () => {
    const limiter = new InMemorySubmitRateLimiter(50, 2);

    limiter.checkAndRecord("loc-1");
    limiter.checkAndRecord("loc-1");
    expect(limiter.checkAndRecord("loc-1")).toBe(false);

    await new Promise((r) => setTimeout(r, 60));

    expect(limiter.checkAndRecord("loc-1")).toBe(true);
  });

  it("tracks different locationIds independently", () => {
    const limiter = new InMemorySubmitRateLimiter(50, 2);

    limiter.checkAndRecord("loc-1");
    limiter.checkAndRecord("loc-1");
    expect(limiter.checkAndRecord("loc-1")).toBe(false);

    expect(limiter.checkAndRecord("loc-2")).toBe(true);
  });
});
