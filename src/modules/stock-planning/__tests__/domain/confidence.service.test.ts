import { computeConfidence, type ConfidenceSignals } from "../../domain/services/confidence.service.js";

const GOOD_SIGNALS: ConfidenceSignals = {
  historyDaysAvailable: 60,
  backtestWape: 0.1,
  hasIncompleteMapping: false,
  pendingReviewsAffectingItem: false,
  hasNegativeOrStaleStock: false,
  daysSinceLastPhysicalCount: 10,
};

describe("computeConfidence", () => {
  it("dados maduros e limpos → alta", () => {
    expect(computeConfidence(GOOD_SIGNALS)).toBe("alta");
  });

  it("pouco histórico → baixa (cold start, secção 24)", () => {
    expect(computeConfidence({ ...GOOD_SIGNALS, historyDaysAvailable: 3, backtestWape: null })).toBe("baixa");
  });

  it("mapeamento incompleto → nunca alta, mesmo com histórico bom", () => {
    const result = computeConfidence({ ...GOOD_SIGNALS, hasIncompleteMapping: true });
    expect(result).not.toBe("alta");
  });

  it("compras por rever pendentes reduzem confiança sem impedir o cálculo", () => {
    const withPending = computeConfidence({ ...GOOD_SIGNALS, pendingReviewsAffectingItem: true });
    const without = computeConfidence(GOOD_SIGNALS);
    // withPending nunca é "melhor" que without
    const rank: Record<string, number> = { alta: 2, media: 1, baixa: 0 };
    expect(rank[withPending]).toBeLessThanOrEqual(rank[without]!);
  });

  it("nunca contado fisicamente → penaliza a confiança", () => {
    const result = computeConfidence({ ...GOOD_SIGNALS, daysSinceLastPhysicalCount: null });
    expect(result).not.toBe("alta");
  });
});
