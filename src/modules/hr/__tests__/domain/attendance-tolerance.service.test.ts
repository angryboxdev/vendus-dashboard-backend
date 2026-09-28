import { DateTime } from "luxon";
import {
  classifyByTolerance,
  describeToleranceOccurrence,
  resolveEffectiveRules,
} from "../../domain/services/attendance-tolerance.service.js";
import { DEFAULT_ATTENDANCE_RULES } from "../../domain/entities/attendance-rules.js";
import type { AttendancePeriod } from "../../domain/services/attendance-conference.service.js";
import type { AttendanceRulesVersion } from "../../domain/entities/attendance-rules.js";

const WORK_DATE = "2026-09-27";
const ZONE = "Europe/Lisbon";
const RULES = DEFAULT_ATTENDANCE_RULES; // entry 10 / earlyExit 5 / absence 60 / preWindow 30 / postWindow 60

function nowAt(time: string): DateTime {
  return DateTime.fromISO(`${WORK_DATE}T${time}`, { zone: ZONE });
}

function directPeriod(overrides: Partial<AttendancePeriod> = {}): AttendancePeriod[] {
  return [{ plannedStart: "12:00", plannedEnd: "20:00", actualStart: null, actualEnd: null, ...overrides }];
}

describe("classifyByTolerance — turno direto (12:00–20:00)", () => {
  it("entrada dentro da tolerância (12:10 exato) → ok", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "12:10", actualEnd: "20:00" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("ok");
  });

  it("entrada 1 minuto além da tolerância (12:11) → late_entry, diff real (não só o excedente)", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "12:11", actualEnd: "20:00" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("late_entry");
    expect(result.diffMinutes).toBe(11);
  });

  it("entrada bem atrasada (12:18) → diff real de 18 min, não só o excedente (task secção 2)", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "12:18", actualEnd: "20:00" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("late_entry");
    expect(result.diffMinutes).toBe(18);
  });

  it("entrada exatamente no início do turno (12:00) → ok", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "12:00", actualEnd: "20:00" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("ok");
  });

  it("entrada antes da janela permitida (11:15, janela=30min → só a partir das 11:30) → before_window", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "11:15", actualEnd: "20:00" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("before_window");
  });

  it("entrada dentro da janela (11:45) → ok", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "11:45", actualEnd: "20:00" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("ok");
  });

  it("sem entrada, antes do limite de ausência (12:10, threshold=60min) → no_entry", () => {
    const result = classifyByTolerance(directPeriod(), WORK_DATE, false, RULES, nowAt("12:10"));
    expect(result.kind).toBe("no_entry");
  });

  it("sem entrada, depois do limite de ausência (13:01) → absence", () => {
    const result = classifyByTolerance(directPeriod(), WORK_DATE, false, RULES, nowAt("13:01"));
    expect(result.kind).toBe("absence");
  });

  it("entrada registada depois de já ter passado o limite de ausência → deixa de ser absence (passa a late_entry, task secção 9)", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "13:05", actualEnd: "20:00" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("late_entry");
    expect(result.diffMinutes).toBe(65);
  });

  it("saída dentro da tolerância (19:55, tolerância=5min) → ok", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "12:00", actualEnd: "19:55" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("ok");
  });

  it("saída antecipada além da tolerância (19:49) → early_exit", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "12:00", actualEnd: "19:49" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("early_exit");
    expect(result.diffMinutes).toBe(-11);
  });

  it("chegou, ainda a meio do turno sem saída → ok (não é pendência ainda)", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "12:00" }), WORK_DATE, false, RULES, nowAt("15:00"));
    expect(result.kind).toBe("ok");
  });

  it("chegou, turno já terminou sem saída → no_exit", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "12:00" }), WORK_DATE, false, RULES, nowAt("20:01"));
    expect(result.kind).toBe("no_exit");
  });
});

describe("classifyByTolerance — turno repartido (12:00–15:00 | 18:00–23:00)", () => {
  function splitPeriods(overrides: { first?: Partial<AttendancePeriod>; second?: Partial<AttendancePeriod> } = {}): AttendancePeriod[] {
    return [
      { plannedStart: "12:00", plannedEnd: "15:00", actualStart: null, actualEnd: null, ...overrides.first },
      { plannedStart: "18:00", plannedEnd: "23:00", actualStart: null, actualEnd: null, ...overrides.second },
    ];
  }

  it("vários atrasos no mesmo turno — aplica a regra a cada período, reduz ao mais grave", () => {
    const periods = splitPeriods({
      first: { actualStart: "12:04", actualEnd: "15:00" },
      second: { actualStart: "18:18", actualEnd: "23:00" },
    });
    const result = classifyByTolerance(periods, WORK_DATE, false, RULES, nowAt("23:00"));
    expect(result.kind).toBe("late_entry");
    expect(result.diffMinutes).toBe(18);
  });

  it("1º período cumprido, 2º ainda não começou → ok", () => {
    const periods = splitPeriods({ first: { actualStart: "12:00", actualEnd: "15:00" } });
    const result = classifyByTolerance(periods, WORK_DATE, false, RULES, nowAt("17:00"));
    expect(result.kind).toBe("ok");
  });

  it("1º período cumprido, 2º sem entrada (dentro do turno mas sem marcação) → incomplete_period, não 'Sem entrada' isolado", () => {
    const periods = splitPeriods({ first: { actualStart: "12:00", actualEnd: "15:00" } });
    const result = classifyByTolerance(periods, WORK_DATE, false, RULES, nowAt("18:30"));
    expect(result.kind).toBe("incomplete_period");
  });

  it("2º período cumprido, 1º sem entrada → incomplete_period também (simétrico)", () => {
    const periods = splitPeriods({ second: { actualStart: "18:00", actualEnd: "23:00" } });
    const result = classifyByTolerance(periods, WORK_DATE, false, RULES, nowAt("23:00"));
    expect(result.kind).toBe("incomplete_period");
  });

  it("os 2 períodos com atraso (nenhum kind 'em falta') → não é incomplete_period, reduz ao mais grave normalmente", () => {
    const periods = splitPeriods({
      first: { actualStart: "12:04", actualEnd: "15:00" },
      second: { actualStart: "18:18", actualEnd: "23:00" },
    });
    const result = classifyByTolerance(periods, WORK_DATE, false, RULES, nowAt("23:00"));
    expect(result.kind).toBe("late_entry");
  });
});

describe("classifyByTolerance — início do controlo de assiduidade (controlStartDate)", () => {
  it("turno anterior ao início do controlo nunca gera pendência automática, mesmo com atraso real", () => {
    const rulesWithControlStart = { ...RULES, controlStartDate: "2026-10-01" };
    const result = classifyByTolerance(directPeriod({ actualStart: "12:18", actualEnd: "20:00" }), WORK_DATE, false, rulesWithControlStart, nowAt("20:00"));
    expect(result.kind).toBe("ok");
  });

  it("turno no dia exato do início do controlo (ou depois) já é classificado normalmente", () => {
    const rulesWithControlStart = { ...RULES, controlStartDate: WORK_DATE };
    const result = classifyByTolerance(directPeriod({ actualStart: "12:18", actualEnd: "20:00" }), WORK_DATE, false, rulesWithControlStart, nowAt("20:00"));
    expect(result.kind).toBe("late_entry");
  });

  it("controlStartDate null (default) nunca restringe nada — comportamento de antes desta regra existir", () => {
    const result = classifyByTolerance(directPeriod({ actualStart: "12:18", actualEnd: "20:00" }), WORK_DATE, false, RULES, nowAt("20:00"));
    expect(result.kind).toBe("late_entry");
  });
});

describe("classifyByTolerance — turno noturno (22:00–06:00 +1 dia)", () => {
  it("saída às 06:05 do dia seguinte, dentro da tolerância → ok", () => {
    const periods: AttendancePeriod[] = [{ plannedStart: "22:00", plannedEnd: "06:00", actualStart: "22:00", actualEnd: "06:05" }];
    const result = classifyByTolerance(periods, WORK_DATE, true, RULES, DateTime.fromISO(`${WORK_DATE}T23:00:00`, { zone: ZONE }).plus({ hours: 8 }));
    expect(result.kind).toBe("ok");
  });

  it("sem saída, turno noturno ainda não terminou (antes das 06:00 do dia seguinte) → ok", () => {
    const periods: AttendancePeriod[] = [{ plannedStart: "22:00", plannedEnd: "06:00", actualStart: "22:00", actualEnd: null }];
    const result = classifyByTolerance(periods, WORK_DATE, true, RULES, DateTime.fromISO(`${WORK_DATE}T23:00:00`, { zone: ZONE }).plus({ hours: 4 }));
    expect(result.kind).toBe("ok");
  });

  it("sem saída, já passou das 06:00 do dia seguinte → no_exit", () => {
    const periods: AttendancePeriod[] = [{ plannedStart: "22:00", plannedEnd: "06:00", actualStart: "22:00", actualEnd: null }];
    const result = classifyByTolerance(periods, WORK_DATE, true, RULES, DateTime.fromISO(`${WORK_DATE}T23:00:00`, { zone: ZONE }).plus({ hours: 9 }));
    expect(result.kind).toBe("no_exit");
  });
});

describe("describeToleranceOccurrence", () => {
  it("inclui o atraso real no rótulo", () => {
    expect(describeToleranceOccurrence("late_entry", 18)).toBe("Atraso na entrada (18 min)");
  });

  it("nunca mostra sinal negativo no rótulo de saída antecipada", () => {
    expect(describeToleranceOccurrence("early_exit", -11)).toBe("Saída antecipada (11 min)");
  });

  it("período incompleto tem rótulo próprio", () => {
    expect(describeToleranceOccurrence("incomplete_period", null)).toBe("Turno/período incompleto");
  });
});

describe("resolveEffectiveRules", () => {
  function version(overrides: Partial<AttendanceRulesVersion>): AttendanceRulesVersion {
    return {
      id: "v1",
      organizationId: "org1",
      entryToleranceMinutes: 10,
      earlyExitToleranceMinutes: 5,
      absenceThresholdMinutes: 60,
      preShiftWindowMinutes: 30,
      postShiftWindowMinutes: 60,
      controlStartDate: null,
      effectiveFrom: "2026-01-01",
      changedBy: "manager1",
      createdAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("sem nenhuma versão criada → devolve o default", () => {
    expect(resolveEffectiveRules([], WORK_DATE)).toEqual(DEFAULT_ATTENDANCE_RULES);
  });

  it("escolhe a versão vigente na data (nunca uma alteração posterior)", () => {
    const older = version({ id: "older", entryToleranceMinutes: 5, effectiveFrom: "2026-08-01" });
    const newer = version({ id: "newer", entryToleranceMinutes: 20, effectiveFrom: "2026-10-01" });
    const effective = resolveEffectiveRules([older, newer], WORK_DATE); // 2026-09-27, entre as duas
    expect(effective.entryToleranceMinutes).toBe(5);
  });

  it("alteração feita hoje nunca reclassifica um período já decorrido (vigência futura ao período)", () => {
    const past = version({ id: "past", entryToleranceMinutes: 10, effectiveFrom: "2026-01-01" });
    const changedToday = version({ id: "today", entryToleranceMinutes: 99, effectiveFrom: "2026-12-01" });
    const effective = resolveEffectiveRules([past, changedToday], WORK_DATE);
    expect(effective.entryToleranceMinutes).toBe(10);
  });
});
