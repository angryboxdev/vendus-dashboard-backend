import { DateTime } from "luxon";
import {
  computeShiftState,
  computeShiftExceptions,
  computeOperationDisplayState,
  describeSituation,
  describeShiftSchedule,
  describeExceptionLabel,
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
    endsNextDay: false,
    secondStartTime: null,
    secondEndTime: null,
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

describe("shiftWindow (turno repartido/noturno) — via computeShiftState/shiftNeedsReview", () => {
  it("turno repartido: não fica AUSENTE durante o intervalo previsto entre os 2 períodos", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    const duringBreak = DateTime.fromISO(`${WORK_DATE}T17:00:00`, { zone: "Europe/Lisbon" });
    expect(computeShiftState(shift, duringBreak)).not.toBe("AUSENTE_OPERACIONAL");
    expect(computeShiftState(shift, duringBreak)).toBe("ATRASADO_AGUARDANDO_ENTRADA");
  });

  it("turno repartido: só fica AUSENTE depois do fim do 2º período", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    const afterSecondSegment = DateTime.fromISO(`${WORK_DATE}T23:30:00`, { zone: "Europe/Lisbon" });
    expect(computeShiftState(shift, afterSecondSegment)).toBe("AUSENTE_OPERACIONAL");
  });

  it("turno noturno: continua dentro da janela depois da meia-noite", () => {
    const shift = makeShift({ startTime: "22:00", endTime: "06:00", endsNextDay: true });
    const nextDayEarlyMorning = DateTime.fromISO(`${WORK_DATE}T22:00:00`, { zone: "Europe/Lisbon" }).plus({ hours: 7 }); // 05:00 do dia seguinte
    expect(computeShiftState(shift, nextDayEarlyMorning)).toBe("ATRASADO_AGUARDANDO_ENTRADA");
  });

  it("turno noturno: só fica AUSENTE depois das 06:00 do dia seguinte", () => {
    const shift = makeShift({ startTime: "22:00", endTime: "06:00", endsNextDay: true });
    const afterEnd = DateTime.fromISO(`${WORK_DATE}T22:00:00`, { zone: "Europe/Lisbon" }).plus({ hours: 9 }); // 07:00 do dia seguinte
    expect(computeShiftState(shift, afterEnd)).toBe("AUSENTE_OPERACIONAL");
  });
});

describe("computeOperationDisplayState", () => {
  it("renomeia ATRASADO_AGUARDANDO_ENTRADA para ATRASADO e AUSENTE_OPERACIONAL para AUSENTE", () => {
    const shift = makeShift();
    const late = DateTime.fromISO(`${WORK_DATE}T09:30:00`, { zone: "Europe/Lisbon" });
    const absent = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    expect(computeOperationDisplayState(shift, late)).toBe("ATRASADO");
    expect(computeOperationDisplayState(shift, absent)).toBe("AUSENTE");
  });

  it("INTERVALO durante o intervalo de um turno repartido, mesmo com entrada registada", () => {
    const shift = makeShift({
      startTime: "12:00",
      endTime: "16:00",
      secondStartTime: "19:00",
      secondEndTime: "23:00",
      actualStartTime: "12:00",
    });
    const duringBreak = DateTime.fromISO(`${WORK_DATE}T17:00:00`, { zone: "Europe/Lisbon" });
    expect(computeOperationDisplayState(shift, duringBreak)).toBe("INTERVALO");
  });

  it("fora do intervalo, um turno repartido segue o estado normal", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    const beforeBreak = DateTime.fromISO(`${WORK_DATE}T13:00:00`, { zone: "Europe/Lisbon" });
    expect(computeOperationDisplayState(shift, beforeBreak)).not.toBe("INTERVALO");
  });

  it("AUSENTE (não INTERVALO) durante o intervalo de um turno repartido quando nunca houve entrada no 1º período", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    const duringBreak = DateTime.fromISO(`${WORK_DATE}T17:00:00`, { zone: "Europe/Lisbon" });
    expect(computeOperationDisplayState(shift, duringBreak)).toBe("AUSENTE");
  });

  it("turno cancelado mantém-se FINALIZADO mesmo que caia na janela de intervalo", () => {
    const shift = makeShift({
      startTime: "12:00",
      endTime: "16:00",
      secondStartTime: "19:00",
      secondEndTime: "23:00",
      attendanceStatus: "cancelled",
    });
    const duringBreak = DateTime.fromISO(`${WORK_DATE}T17:00:00`, { zone: "Europe/Lisbon" });
    expect(computeOperationDisplayState(shift, duringBreak)).toBe("FINALIZADO");
  });
});

describe("describeSituation", () => {
  it("AGENDADO: 'Inicia às HH:mm'", () => {
    expect(describeSituation(makeShift(), "AGENDADO", NOW)).toEqual({ situation: "Inicia às 09:00", situationWarning: null });
  });

  it("EM_TOLERANCIA/ATRASADO/AUSENTE: 'Sem entrada'", () => {
    expect(describeSituation(makeShift(), "EM_TOLERANCIA", NOW)).toEqual({ situation: "Sem entrada", situationWarning: null });
    expect(describeSituation(makeShift(), "ATRASADO", NOW)).toEqual({ situation: "Sem entrada", situationWarning: null });
    expect(describeSituation(makeShift(), "AUSENTE", NOW)).toEqual({ situation: "Sem entrada", situationWarning: null });
  });

  it("ATRASADO num turno repartido, já depois do início do 2º período: 'Sem entrada no 2º turno'", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    const afterSecondStart = DateTime.fromISO(`${WORK_DATE}T19:30:00`, { zone: "Europe/Lisbon" });
    expect(describeSituation(shift, "ATRASADO", afterSecondStart)).toEqual({ situation: "Sem entrada no 2º turno", situationWarning: null });
  });

  it("AUSENTE durante o intervalo de um turno repartido (nunca chegou no 1º período): '1º turno sem entrada · Próximo às HH:mm'", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    const duringBreak = DateTime.fromISO(`${WORK_DATE}T17:00:00`, { zone: "Europe/Lisbon" });
    expect(describeSituation(shift, "AUSENTE", duringBreak)).toEqual({
      situation: "1º turno sem entrada · Próximo às 19:00",
      situationWarning: null,
    });
  });

  it("AUSENTE depois do fim do 2º período, sem nunca ter chegado: 'Sem entrada' (terminal)", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    const afterSecondSegment = DateTime.fromISO(`${WORK_DATE}T23:30:00`, { zone: "Europe/Lisbon" });
    expect(describeSituation(shift, "AUSENTE", afterSecondSegment)).toEqual({ situation: "Sem entrada", situationWarning: null });
  });

  it("INTERVALO: 'Regresso previsto HH:mm' (hora do 2º período)", () => {
    const shift = makeShift({ secondStartTime: "19:00", secondEndTime: "23:00" });
    expect(describeSituation(shift, "INTERVALO", NOW)).toEqual({ situation: "Regresso previsto 19:00", situationWarning: null });
  });

  it("PRESENTE com atraso: 'Entrada HH:mm · atraso N min'", () => {
    const shift = makeShift({ actualStartTime: "09:22", attendanceStatus: "late", lateMinutes: 22 });
    expect(describeSituation(shift, "PRESENTE", NOW)).toEqual({ situation: "Entrada 09:22 · atraso 22 min", situationWarning: null });
  });

  it("PRESENTE sem atraso: só 'Entrada HH:mm'", () => {
    const shift = makeShift({ actualStartTime: "08:58" });
    expect(describeSituation(shift, "PRESENTE", NOW)).toEqual({ situation: "Entrada 08:58", situationWarning: null });
  });

  it("PRESENTE mas já devia ter saído: 'Sem saída'", () => {
    const shift = makeShift({ actualStartTime: "09:00" });
    const afterEnd = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    expect(describeSituation(shift, "PRESENTE", afterEnd)).toEqual({ situation: "Sem saída", situationWarning: null });
  });

  it("PRESENTE num turno repartido em que só o 2º período teve entrada: situação mostra a entrada, mas mantém aviso '1º turno sem entrada'", () => {
    // Caso "Lucas Almeida" da secção 7 do doc: faltou o check-in do 1º período, mas
    // entrou no 2º (18:02, já depois do fim do 1º período às 16:00) — o Estado
    // apresentado é PRESENTE, a Situação mostra a entrada real, e o aviso da
    // inconsistência do 1º período fica visível como linha secundária persistente.
    const shift = makeShift({
      startTime: "10:00",
      endTime: "16:00",
      secondStartTime: "18:00",
      secondEndTime: "22:00",
      actualStartTime: "18:02",
    });
    expect(describeSituation(shift, "PRESENTE", NOW)).toEqual({ situation: "Entrada 18:02", situationWarning: "1º turno sem entrada" });
  });

  it("PRESENTE num turno repartido com entrada dentro do 1º período: sem aviso", () => {
    const shift = makeShift({
      startTime: "10:00",
      endTime: "16:00",
      secondStartTime: "18:00",
      secondEndTime: "22:00",
      actualStartTime: "10:05",
    });
    expect(describeSituation(shift, "PRESENTE", NOW)).toEqual({ situation: "Entrada 10:05", situationWarning: null });
  });

  it("FINALIZADO: 'Saída HH:mm', ou 'Turno cancelado' quando cancelado", () => {
    const shift = makeShift({ actualStartTime: "09:00", actualEndTime: "17:05" });
    expect(describeSituation(shift, "FINALIZADO", NOW)).toEqual({ situation: "Saída 17:05", situationWarning: null });
    expect(describeSituation(makeShift({ attendanceStatus: "cancelled" }), "FINALIZADO", NOW)).toEqual({
      situation: "Turno cancelado",
      situationWarning: null,
    });
  });
});

describe("describeShiftSchedule", () => {
  it("turno direto: '09:00–17:00'", () => {
    expect(describeShiftSchedule(makeShift())).toEqual(["09:00–17:00"]);
  });

  it("turno repartido: 2 partes", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    expect(describeShiftSchedule(shift)).toEqual(["12:00–16:00", "19:00–23:00"]);
  });

  it("turno noturno: sufixo '(+1 dia)'", () => {
    const shift = makeShift({ startTime: "22:00", endTime: "06:00", endsNextDay: true });
    expect(describeShiftSchedule(shift)).toEqual(["22:00–06:00 (+1 dia)"]);
  });
});

describe("describeExceptionLabel", () => {
  it("prioriza SEM_SAIDA sobre as restantes", () => {
    expect(describeExceptionLabel(["SEM_SAIDA", "CHEGADA_ATRASADA"], 10)).toBe("Sem saída");
  });

  it("CHEGADA_ATRASADA inclui os minutos", () => {
    expect(describeExceptionLabel(["CHEGADA_ATRASADA"], 12)).toBe("Atraso +12 min");
  });

  it("sem exceções: 'Por conferir'", () => {
    expect(describeExceptionLabel([], null)).toBe("Por conferir");
  });
});
