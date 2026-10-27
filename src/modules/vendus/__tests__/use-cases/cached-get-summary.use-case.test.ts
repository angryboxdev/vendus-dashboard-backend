import { CachedGetSummaryUseCase } from "../../application/use-cases/cached-get-summary.use-case.js";
import type { GetSummaryPort, VendusSummaryResult } from "../../domain/ports/in/get-summary.port.js";

function fakeInner(fail = false) {
  const calls: string[] = [];
  const inner: GetSummaryPort = {
    execute: async ({ since, until }) => {
      calls.push(`${since}|${until}`);
      if (fail) throw new Error("Vendus indisponível");
      return { documents: [], analytics: {} } as unknown as VendusSummaryResult;
    },
  };
  return { inner, calls };
}

const today = () => "2026-10-27";

describe("CachedGetSummaryUseCase", () => {
  it("período fechado: pede uma vez e reutiliza", async () => {
    const { inner, calls } = fakeInner();
    const uc = new CachedGetSummaryUseCase(inner, today);
    await uc.execute({ since: "2026-09-01", until: "2026-09-30" });
    await uc.execute({ since: "2026-09-01", until: "2026-09-30" });
    expect(calls).toEqual(["2026-09-01|2026-09-30"]);
  });

  it("período que inclui hoje passa sempre à Vendus", async () => {
    const { inner, calls } = fakeInner();
    const uc = new CachedGetSummaryUseCase(inner, today);
    await uc.execute({ since: "2026-10-01", until: "2026-10-27" });
    await uc.execute({ since: "2026-10-01", until: "2026-10-27" });
    expect(calls).toHaveLength(2);
  });

  it("um erro não fica guardado", async () => {
    const { inner, calls } = fakeInner(true);
    const uc = new CachedGetSummaryUseCase(inner, today);
    await expect(uc.execute({ since: "2026-09-01", until: "2026-09-30" })).rejects.toThrow();
    await expect(uc.execute({ since: "2026-09-01", until: "2026-09-30" })).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });

  it("no limite sai o mais antigo", async () => {
    const { inner, calls } = fakeInner();
    const uc = new CachedGetSummaryUseCase(inner, today, 1);
    await uc.execute({ since: "2026-08-01", until: "2026-08-31" });
    await uc.execute({ since: "2026-09-01", until: "2026-09-30" });
    await uc.execute({ since: "2026-08-01", until: "2026-08-31" });
    expect(calls).toHaveLength(3);
  });
});
