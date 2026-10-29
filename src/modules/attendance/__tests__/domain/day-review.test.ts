import type { DayReview } from "../../domain/entities/day-review.js";
import { applyReview, classifyReview, manualSeconds, rangeSeconds, reviewState, type ReviewFacts } from "../../domain/services/day-review.js";
import type { DayResult } from "../../domain/services/day-engine.js";

const facts = (over: Partial<ReviewFacts> = {}): ReviewFacts => ({
  workDate: "2026-10-12",
  phase: "done",
  closed: false,
  theoreticalSeconds: 8 * 3600,
  plannedRanges: [{ start: "15:00", end: "23:00" }],
  restDay: false,
  holiday: false,
  excusedAbsence: false,
  workedSeconds: 8 * 3600,
  hasPunches: true,
  incomplete: false,
  lateMinutes: 0,
  review: null,
  toleranceMinutes: 5,
  ...over,
});
const day: DayResult = { workDate: "2026-10-12", workedSeconds: 7 * 3600, breakSeconds: 0, nightSeconds: 0, theoreticalSeconds: 8 * 3600, excessSeconds: -3600, pendingSeconds: 0, segments: [], incidents: ["late"] };
const review = (over: Partial<DayReview> = {}): DayReview => ({
  id: "r1",
  employeeId: "e1",
  workDate: "2026-10-12",
  decision: "fulfilled",
  validatedSeconds: 8 * 3600,
  beforeSeconds: 7 * 3600,
  theoreticalSeconds: 8 * 3600,
  plannedRanges: null,
  manual: null,
  absenceType: null,
  reason: "x",
  scope: "day",
  batchId: null,
  dayVersion: null,
  createdBy: "g",
  createdAt: "2026-10-13T10:00:00.000Z",
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  ...over,
});

describe("Conferência V2 — domínio", () => {
  test("faixas: noturno passa a meia-noite; manual desconta a pausa", () => {
    expect(rangeSeconds({ start: "22:00", end: "04:00" })).toBe(6 * 3600);
    expect(manualSeconds({ start: "15:10", end: "23:00", breakMinutes: 30 })).toBe(440 * 60);
  });

  test("a decisão entra no resultado do motor sem tocar nos segmentos", () => {
    expect(applyReview(day, review())).toMatchObject({ workedSeconds: 8 * 3600, excessSeconds: 0, incidents: [] });
    expect(applyReview(day, review({ decision: "keep", validatedSeconds: null }))).toMatchObject({ workedSeconds: 7 * 3600, incidents: [] });
    expect(applyReview(day, undefined)).toBe(day);
  });

  test("estados e decisões nos casos de fronteira", () => {
    expect(reviewState(facts())).toBe("ok");
    expect(reviewState(facts({ lateMinutes: 21, workedSeconds: 459 * 60 }))).toBe("late");
    expect(reviewState(facts({ theoreticalSeconds: 0, restDay: true, hasPunches: false, workedSeconds: 0 }))).toBe("day_off");
    expect(classifyReview(facts({ workedSeconds: 13 * 3600 }), "fulfilled", false)).toMatchObject({ bucket: "excluded", reason: "overtime" });
    expect(classifyReview(facts({ incomplete: true, workedSeconds: 0 }), "fulfilled", true)).toMatchObject({ bucket: "individual", reason: "single_punch" });
    expect(classifyReview(facts({ excusedAbsence: true }), "fulfilled", true)).toMatchObject({ bucket: "excluded", reason: "absence" });
    expect(classifyReview(facts({ hasPunches: false, workedSeconds: 0 }), "absence", true)).toMatchObject({ bucket: "apply" });
    // Ausência acabada de registar (teórico reduzido a zero): confirma-se na mesma.
    expect(classifyReview(facts({ excusedAbsence: true, theoreticalSeconds: 0, hasPunches: false, workedSeconds: 0 }), "absence", true)).toMatchObject({ bucket: "apply" });
  });
});
