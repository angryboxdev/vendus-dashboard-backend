import { describe, it, expect } from "@jest/globals";
import {
  GroupedSettlementMatcherService,
  type SettlementCandidate,
} from "../../domain/services/grouped-settlement-matcher.service.js";

function doc(overrides: Partial<SettlementCandidate> & Pick<SettlementCandidate, "entityId" | "openBalanceCents">): SettlementCandidate {
  return {
    documentType: "invoice",
    invoiceDate: "2026-06-01",
    dueDate: "2026-06-10",
    isOverdue: false,
    ...overrides,
  };
}

describe("GroupedSettlementMatcherService", () => {
  const matcher = new GroupedSettlementMatcherService();

  it("finds the exact 7-document combination (Justdrinks scenario)", () => {
    // 7 documents that sum exactly to the movement amount, plus decoys that
    // must NOT be pulled into the combination.
    const justdrinksDocs: SettlementCandidate[] = [
      doc({ entityId: "jd-1", openBalanceCents: 10_000 }),
      doc({ entityId: "jd-2", openBalanceCents: 15_000 }),
      doc({ entityId: "jd-3", openBalanceCents: 5_000 }),
      doc({ entityId: "jd-4", openBalanceCents: 20_000 }),
      doc({ entityId: "jd-5", openBalanceCents: 8_000 }),
      doc({ entityId: "jd-6", openBalanceCents: 12_000 }),
      doc({ entityId: "jd-7", openBalanceCents: 30_000 }),
    ];
    const target = justdrinksDocs.reduce((s, d) => s + d.openBalanceCents, 0); // 100_000
    const decoys: SettlementCandidate[] = [
      doc({ entityId: "decoy-1", openBalanceCents: 1_234 }),
      doc({ entityId: "decoy-2", openBalanceCents: 999 }),
      doc({ entityId: "decoy-3", openBalanceCents: 77_777 }),
    ];

    const result = matcher.findExactCombinations({
      candidates: [...justdrinksDocs, ...decoys],
      targetAbsCents: target,
      movementDate: "2026-06-15",
    });

    expect(result.combinations.length).toBeGreaterThan(0);
    const best = result.combinations[0]!;
    expect(best.totalCents).toBe(target);
    const ids = best.candidates.map((c) => c.entityId).sort();
    expect(ids).toEqual(["jd-1", "jd-2", "jd-3", "jd-4", "jd-5", "jd-6", "jd-7"]);
  });

  it("finds a combination that includes a credit note (negative balance)", () => {
    const candidates: SettlementCandidate[] = [
      doc({ entityId: "inv-1", openBalanceCents: 40_000 }),
      doc({ entityId: "inv-2", openBalanceCents: 35_000 }),
      doc({ entityId: "inv-3", openBalanceCents: 25_000 }),
      doc({ entityId: "cn-1", documentType: "credit_note", openBalanceCents: -20_000 }),
      doc({ entityId: "decoy", openBalanceCents: 1_000 }),
    ];
    // 40_000 + 35_000 + 25_000 - 20_000 = 80_000
    const result = matcher.findExactCombinations({
      candidates,
      targetAbsCents: 80_000,
      movementDate: "2026-06-15",
    });

    expect(result.combinations.length).toBeGreaterThan(0);
    const best = result.combinations[0]!;
    expect(best.totalCents).toBe(80_000);
    const ids = best.candidates.map((c) => c.entityId).sort();
    expect(ids).toEqual(["cn-1", "inv-1", "inv-2", "inv-3"]);
    expect(best.candidates.find((c) => c.entityId === "cn-1")!.documentType).toBe("credit_note");
  });

  it("returns no combinations when no subset sums to the target", () => {
    const candidates: SettlementCandidate[] = [
      doc({ entityId: "a", openBalanceCents: 100 }),
      doc({ entityId: "b", openBalanceCents: 200 }),
      doc({ entityId: "c", openBalanceCents: 300 }),
    ];
    const result = matcher.findExactCombinations({
      candidates,
      targetAbsCents: 999_999,
      movementDate: "2026-06-15",
    });
    expect(result.combinations).toEqual([]);
  });

  it("returns an empty result (not an error) for an empty candidate pool", () => {
    const result = matcher.findExactCombinations({
      candidates: [],
      targetAbsCents: 1_000,
      movementDate: "2026-06-15",
    });
    expect(result.combinations).toEqual([]);
    expect(result.consideredCandidateCount).toBe(0);
    expect(result.totalEligibleCount).toBe(0);
  });

  it("finds multiple exact combinations and never silently picks — surfaces all, ranked", () => {
    // Two disjoint ways to reach 1_000: {c} alone, or {a, b} together.
    const candidates: SettlementCandidate[] = [
      doc({ entityId: "a", openBalanceCents: 500, invoiceDate: "2026-05-01" }),
      doc({ entityId: "b", openBalanceCents: 500, invoiceDate: "2026-05-01" }),
      doc({ entityId: "c", openBalanceCents: 1_000, invoiceDate: "2026-05-01" }),
    ];
    const result = matcher.findExactCombinations({
      candidates,
      targetAbsCents: 1_000,
      movementDate: "2026-06-15",
    });

    // Never silently picks one — both are surfaced for the caller to rank/choose from.
    expect(result.combinations.length).toBe(2);
    const sizes = result.combinations.map((c) => c.candidates.length).sort();
    expect(sizes).toEqual([1, 2]);
    for (const c of result.combinations) {
      expect(c.totalCents).toBe(1_000);
    }
  });

  it("uses fewest-documents strictly as a last-resort tie-breaker (level 4)", () => {
    // Both combinations tie on pre-movement-date count (1), overdue count (0)
    // and oldest document (2026-05-01) — only document count differs.
    const pool: SettlementCandidate[] = [
      doc({ entityId: "solo", openBalanceCents: 1_000, invoiceDate: "2026-05-01", dueDate: "2026-05-01" }),
      doc({ entityId: "pair-a", openBalanceCents: 400, invoiceDate: "2026-05-01", dueDate: "2026-05-01" }),
      doc({ entityId: "pair-b", openBalanceCents: 600, invoiceDate: "2026-05-01", dueDate: "2026-07-01" }),
    ];
    const result = matcher.findExactCombinations({
      candidates: pool,
      targetAbsCents: 1_000,
      movementDate: "2026-06-15",
    });
    expect(result.combinations).toHaveLength(2);
    expect(result.combinations[0]!.candidates.map((c) => c.entityId)).toEqual(["solo"]);
  });

  it("ranks by pre-movement-date document count first (tie-break level 1)", () => {
    // Combo A: one document dated AFTER the movement date (not eligible for auto-pick priority).
    // Combo B: one document dated BEFORE the movement date.
    // Both sum to the same target — B must rank first.
    const candidates: SettlementCandidate[] = [
      doc({ entityId: "after", openBalanceCents: 1_000, invoiceDate: "2026-07-01", dueDate: "2026-07-01" }),
      doc({ entityId: "before", openBalanceCents: 2_000, invoiceDate: "2026-05-01", dueDate: "2026-05-01" }),
    ];
    const result = matcher.findExactCombinations({
      candidates: [candidates[0]!],
      targetAbsCents: 1_000,
      movementDate: "2026-06-15",
    });
    expect(result.combinations).toHaveLength(1);

    // Now combine both into one pool where two DIFFERENT combinations (not
    // sharing documents) reach the same target via extra padding docs.
    const pool: SettlementCandidate[] = [
      doc({ entityId: "after-1000", openBalanceCents: 1_000, invoiceDate: "2026-07-01", dueDate: "2026-07-01" }),
      doc({ entityId: "before-a", openBalanceCents: 600, invoiceDate: "2026-05-01", dueDate: "2026-05-01" }),
      doc({ entityId: "before-b", openBalanceCents: 400, invoiceDate: "2026-05-02", dueDate: "2026-05-02" }),
    ];
    const combined = matcher.findExactCombinations({
      candidates: pool,
      targetAbsCents: 1_000,
      movementDate: "2026-06-15",
    });
    expect(combined.combinations).toHaveLength(2);
    // The combo entirely before the movement date (before-a + before-b) ranks first.
    expect(combined.combinations[0]!.candidates.map((c) => c.entityId).sort()).toEqual(["before-a", "before-b"]);
  });

  it("ranks by overdue count when pre-movement-date counts tie (tie-break level 2)", () => {
    // Both combos tie on pre-movement-date count (1 each: current-b's due
    // date is AFTER the movement, so it doesn't count) — overdue decides.
    const pool: SettlementCandidate[] = [
      doc({ entityId: "overdue-1000", openBalanceCents: 1_000, invoiceDate: "2026-05-01", dueDate: "2026-05-01", isOverdue: true }),
      doc({ entityId: "current-a", openBalanceCents: 600, invoiceDate: "2026-05-01", dueDate: "2026-05-01", isOverdue: false }),
      doc({ entityId: "current-b", openBalanceCents: 400, invoiceDate: "2026-05-01", dueDate: "2026-07-01", isOverdue: false }),
    ];
    const result = matcher.findExactCombinations({
      candidates: pool,
      targetAbsCents: 1_000,
      movementDate: "2026-06-15",
    });
    expect(result.combinations).toHaveLength(2);
    expect(result.combinations[0]!.candidates.map((c) => c.entityId)).toEqual(["overdue-1000"]);
  });

  it("ranks by oldest document when pre-date and overdue counts tie (tie-break level 3)", () => {
    const pool: SettlementCandidate[] = [
      doc({ entityId: "old-single", openBalanceCents: 1_000, invoiceDate: "2026-01-01", dueDate: "2026-05-01" }),
      doc({ entityId: "newer-single", openBalanceCents: 1_000, invoiceDate: "2026-04-01", dueDate: "2026-05-01" }),
    ];
    // Two separate single-document combinations both matching a target of 1_000.
    const result = matcher.findExactCombinations({
      candidates: pool,
      targetAbsCents: 1_000,
      movementDate: "2026-06-15",
    });
    expect(result.combinations).toHaveLength(2);
    expect(result.combinations[0]!.candidates[0]!.entityId).toBe("old-single");
  });

  it("caps the candidate pool at 40, nearest to the movement date, and never considers the rest", () => {
    const movementDate = "2026-06-15";
    const nearDocs: SettlementCandidate[] = [];
    for (let i = 0; i < 40; i++) {
      const day = String(1 + (i % 28)).padStart(2, "0");
      nearDocs.push(
        doc({
          entityId: `near-${i}`,
          openBalanceCents: (i + 1) * 100, // 100..4000, all distinct
          invoiceDate: `2026-06-${day}`,
          dueDate: `2026-06-${day}`,
        })
      );
    }
    // 5 far-away candidates (way outside the 40-cap) forming an otherwise-valid
    // combination that must NOT be found once capped away.
    const farDocs: SettlementCandidate[] = [
      doc({ entityId: "far-1", openBalanceCents: 555_555, invoiceDate: "2010-01-01", dueDate: "2010-01-01" }),
      doc({ entityId: "far-2", openBalanceCents: 1, invoiceDate: "2010-01-02", dueDate: "2010-01-02" }),
      doc({ entityId: "far-3", openBalanceCents: 1, invoiceDate: "2010-01-03", dueDate: "2010-01-03" }),
      doc({ entityId: "far-4", openBalanceCents: 1, invoiceDate: "2010-01-04", dueDate: "2010-01-04" }),
      doc({ entityId: "far-5", openBalanceCents: 1, invoiceDate: "2010-01-05", dueDate: "2010-01-05" }),
    ];
    // Target reachable ONLY via the lone far candidate (a single-document
    // combination) — must disappear entirely once capped away.
    const farOnlyTarget = 555_555;
    // Target reachable via two near candidates (indices 4 → 500 cents, and
    // 34 → 3500 cents ⇒ 4000 cents) — must still be found.
    const nearTarget = 500 + 3_500;

    const result = matcher.findExactCombinations({
      candidates: [...nearDocs, ...farDocs],
      targetAbsCents: nearTarget,
      movementDate,
    });

    expect(result.totalEligibleCount).toBe(45);
    expect(result.consideredCandidateCount).toBe(40);
    // The far-away candidates never entered the pool at all.
    for (const c of result.combinations) {
      expect(c.candidates.some((d) => d.entityId.startsWith("far-"))).toBe(false);
    }
    expect(result.combinations.some((c) => c.totalCents === nearTarget)).toBe(true);

    const farOnlyResult = matcher.findExactCombinations({
      candidates: [...nearDocs, ...farDocs],
      targetAbsCents: farOnlyTarget,
      movementDate,
    });
    // The far-only target is unreachable once the far candidates are capped away.
    expect(farOnlyResult.combinations).toEqual([]);
  });

  it("does not brute-force beyond the cap — 40 candidates resolve quickly", () => {
    const movementDate = "2026-06-15";
    const candidates: SettlementCandidate[] = [];
    for (let i = 0; i < 40; i++) {
      candidates.push(
        doc({
          entityId: `c-${i}`,
          openBalanceCents: 1_000_000 + i, // no two subsets collide by accident
          invoiceDate: "2026-06-01",
        })
      );
    }
    const start = Date.now();
    const result = matcher.findExactCombinations({
      candidates,
      targetAbsCents: 999_999_999, // unreachable
      movementDate,
    });
    const elapsedMs = Date.now() - start;
    expect(result.combinations).toEqual([]);
    expect(elapsedMs).toBeLessThan(5_000);
  });
});
