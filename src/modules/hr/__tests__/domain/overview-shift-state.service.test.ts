import { DateTime } from "luxon";
import {
  computeShiftState,
  computeShiftExceptions,
  shiftNeedsReview,
  hasOverlappingOpenAttendance,
  assignReviewPriority,
  LATE_TOLERANCE_MINUTES,
} from "../../domain/services/overview-shift-state.service.js";
import type { ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";

const WORK_DATE = "2026-09-26";
const NOW = DateTime.fromISO(`${WORK_DATE}T12:00:00`, { zone: "Europe/Lisbon" });

function makeShift(overrides: Partial<ShiftOccurrence> = {}): ShiftOccurrence {
  return {
    shiftId: "s1",
    employeeId: "e1",
    workDate: WORK_DATE,
    startTime: "09:00",
    endTime: "17:00",
    locationId: "loc1",
    attendanceStatus: null,
    actualStartTime: null,
    actualEndTime: null,
    lateMinutes: null,
    ...overrides,
  };
}

describe("computeShiftState", () => {
  it("AGENDADO antes do início previsto", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T08:00:00`, { zone: "Europe/Lisbon" });
    expect(computeShiftState(makeShift(), now)).toBe("AGENDADO");
  });

  it("EM_TOLERANCIA dentro da janela de tolerância, sem chegada", () => {
    expect(LATE_TOLERANCE_MINUTES).toBeGreaterThan(5); // pressuposto pela hora escolhida abaixo
    const now = DateTime.fromISO(`${WORK_DATE}T09:05:00`, { zone: "Europe/Lisbon" });
    expect(computeShiftState(makeShift(), now)).toBe("EM_TOLERANCIA");
  });

  it("ATRASADO_AGUARDANDO_ENTRADA depois da tolerância, ainda dentro do turno, sem chegada", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T09:30:00`, { zone: "Europe/Lisbon" });
    expect(computeShiftState(makeShift(), now)).toBe("ATRASADO_AGUARDANDO_ENTRADA");
  });

  it("AUSENTE_OPERACIONAL depois do fim do turno, nunca chegou", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    expect(computeShiftState(makeShift(), now)).toBe("AUSENTE_OPERACIONAL");
  });

  it("PRESENTE quando há entrada sem saída, mesmo depois do fim previsto (kiosk atrasado a fechar)", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    expect(computeShiftState(makeShift({ actualStartTime: "09:05" }), now)).toBe("PRESENTE");
  });

  it("FINALIZADO com entrada e saída registadas", () => {
    expect(computeShiftState(makeShift({ actualStartTime: "09:00", actualEndTime: "17:05" }), NOW)).toBe("FINALIZADO");
  });

  it("turno cancelado é sempre FINALIZADO, mesmo sem nenhuma marcação", () => {
    expect(computeShiftState(makeShift({ attendanceStatus: "cancelled" }), NOW)).toBe("FINALIZADO");
  });
});

describe("computeShiftExceptions", () => {
  it("CHEGADA_ATRASADA quando status='late'", () => {
    expect(computeShiftExceptions(makeShift({ attendanceStatus: "late", actualStartTime: "09:20" }), NOW)).toContain(
      "CHEGADA_ATRASADA",
    );
  });

  it("SAIDA_ANTECIPADA quando status='left_early'", () => {
    expect(
      computeShiftExceptions(makeShift({ attendanceStatus: "left_early", actualStartTime: "09:00", actualEndTime: "15:00" }), NOW),
    ).toContain("SAIDA_ANTECIPADA");
  });

  it("SEM_ENTRADA quando há saída sem entrada (representável pela BD)", () => {
    expect(computeShiftExceptions(makeShift({ actualEndTime: "17:00" }), NOW)).toContain("SEM_ENTRADA");
  });

  it("SEM_SAIDA quando há entrada sem saída e o turno já terminou", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    expect(computeShiftExceptions(makeShift({ actualStartTime: "09:00" }), now)).toContain("SEM_SAIDA");
  });

  it("SEM_SAIDA não se aplica enquanto o turno ainda decorre", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T12:00:00`, { zone: "Europe/Lisbon" });
    expect(computeShiftExceptions(makeShift({ actualStartTime: "09:00" }), now)).not.toContain("SEM_SAIDA");
  });

  it("turno cancelado nunca gera exceções", () => {
    expect(computeShiftExceptions(makeShift({ attendanceStatus: "cancelled" }), NOW)).toEqual([]);
  });
});

describe("shiftNeedsReview", () => {
  it("true quando o turno já terminou e não há conferência nenhuma", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    expect(shiftNeedsReview(makeShift(), now)).toBe(true);
  });

  it("false enquanto o turno ainda não terminou", () => {
    expect(shiftNeedsReview(makeShift(), NOW)).toBe(false);
  });

  it("false quando já está totalmente conferido (entrada + saída)", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    expect(shiftNeedsReview(makeShift({ actualStartTime: "09:00", actualEndTime: "17:00" }), now)).toBe(false);
  });

  it("false para turnos cancelados", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    expect(shiftNeedsReview(makeShift({ attendanceStatus: "cancelled" }), now)).toBe(false);
  });
});

describe("hasOverlappingOpenAttendance", () => {
  it("true quando o colaborador tem 2 turnos simultaneamente abertos (duas entradas sem saída)", () => {
    const shifts = [
      makeShift({ shiftId: "s1", actualStartTime: "09:00" }),
      makeShift({ shiftId: "s2", startTime: "10:00", endTime: "18:00", actualStartTime: "10:00" }),
    ];
    expect(hasOverlappingOpenAttendance(shifts, NOW)).toBe(true);
  });

  it("false com só um turno aberto", () => {
    const shifts = [makeShift({ actualStartTime: "09:00" })];
    expect(hasOverlappingOpenAttendance(shifts, NOW)).toBe(false);
  });
});

describe("assignReviewPriority", () => {
  const now = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });

  it("ALTA para turno sem saída, recente", () => {
    const shift = makeShift({ actualStartTime: "09:00" });
    expect(assignReviewPriority(shift, computeShiftExceptions(shift, now), now)).toBe("ALTA");
  });

  it("escala para CRITICA quando a mesma exceção está por conferir há mais de 24h", () => {
    const longAgo = now.plus({ days: 2 });
    const shift = makeShift({ actualStartTime: "09:00" });
    expect(assignReviewPriority(shift, computeShiftExceptions(shift, longAgo), longAgo)).toBe("CRITICA");
  });

  it("BAIXA por omissão, sem exceção específica, sobe para MEDIA com antiguidade", () => {
    const shift = makeShift({ workDate: "2026-08-01", startTime: "09:00", endTime: "17:00" });
    const soon = DateTime.fromISO("2026-08-01T18:00:00", { zone: "Europe/Lisbon" });
    expect(assignReviewPriority(shift, [], soon)).toBe("BAIXA");
    const later = soon.plus({ days: 3 });
    expect(assignReviewPriority(shift, [], later)).toBe("MEDIA");
  });
});
