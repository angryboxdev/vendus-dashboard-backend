import { DateTime } from "luxon";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { MonthlyClosure } from "../../domain/entities/monthly-closure.js";
import { GetMonthlyAttendanceSummaryUseCase, deriveEmployeeStatus } from "../../application/use-cases/get-monthly-attendance-summary.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeAttendanceRulesRepository } from "../fakes/fake-attendance-rules-repository.js";
import { FakeAttendanceCorrectionRepository } from "../fakes/fake-attendance-correction-repository.js";
import { FakeMonthlyClosureRepository } from "../fakes/fake-monthly-closure-repository.js";
import type { ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";

const ORG = mintOrganizationId("org-test");

function shift(overrides: Partial<ShiftOccurrence> = {}): ShiftOccurrence {
  return {
    shiftId: "s1",
    employeeId: "e1",
    workDate: "2026-09-05",
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

function makeUseCase() {
  const employees = new FakeEmployeeRepository();
  const shifts = new FakeShiftAttendanceReadAdapter();
  const leave = new FakeLeaveReadAdapter();
  const attendanceRules = new FakeAttendanceRulesRepository();
  const attendanceCorrections = new FakeAttendanceCorrectionRepository();
  const monthlyClosureRepository = new FakeMonthlyClosureRepository();
  return {
    employees,
    shifts,
    attendanceRules,
    attendanceCorrections,
    monthlyClosureRepository,
    useCase: new GetMonthlyAttendanceSummaryUseCase(employees, shifts, leave, attendanceRules, attendanceCorrections, monthlyClosureRepository),
  };
}

describe("deriveEmployeeStatus", () => {
  it("sem nenhuma pendência → pronto para fecho", () => {
    expect(deriveEmployeeStatus(0, 5, true)).toBe("pronto_para_fecho");
  });

  it("pendências com ocorrência grave (ausência/conflito/sem saída) → requer atenção", () => {
    expect(deriveEmployeeStatus(1, 0, true)).toBe("requer_atencao");
  });

  it("muitos dias em atraso (>=3), mesmo sem ocorrência grave → requer atenção", () => {
    expect(deriveEmployeeStatus(2, 3, false)).toBe("requer_atencao");
  });

  it("pendências leves (poucos dias em atraso, sem ocorrência grave) → só pendências", () => {
    expect(deriveEmployeeStatus(2, 2, false)).toBe("pendencias");
  });
});

describe("GetMonthlyAttendanceSummaryUseCase", () => {
  it("agrega turnos/pendentes/atraso por colaborador, nunca reagrega uma 2ª vez", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ shiftId: "s1", employeeId: emp.id, workDate: "2026-09-05", actualStartTime: "09:18", actualEndTime: "17:00" }));
    shifts.seed(ORG, shift({ shiftId: "s2", employeeId: emp.id, workDate: "2026-09-06", actualStartTime: "09:00", actualEndTime: "17:00" }));

    const result = await useCase.execute({ organizationId: ORG, year: 2026, month: 9 });

    const row = result.rows.find((r) => r.employeeId === emp.id)!;
    expect(row.plannedShiftsCount).toBe(2);
    expect(row.actualShiftsCount).toBe(2);
    expect(row.pendingCount).toBe(1); // só o dia com atraso (s1) precisa de conferência — s2 é Regular.
    expect(row.lateDaysCount).toBe(1);
    expect(row.status).toBe("pendencias");
  });

  it("colaborador sem nenhuma pendência → pronto para fecho", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Raul Afonso" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ shiftId: "s1", employeeId: emp.id, workDate: "2026-09-05", actualStartTime: "09:00", actualEndTime: "17:00" }));

    const result = await useCase.execute({ organizationId: ORG, year: 2026, month: 9 });

    const row = result.rows.find((r) => r.employeeId === emp.id)!;
    expect(row.pendingCount).toBe(0);
    expect(row.status).toBe("pronto_para_fecho");
  });

  it.skip("saldo usa planeado ATÉ HOJE, nunca o total do mês (turnos futuros nunca reduzem saldo)", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Lucas Almeida" });
    employees.seed(ORG, emp);
    const now = DateTime.now().setZone("Europe/Lisbon");
    const year = now.year;
    const month = now.month;
    // Sempre dentro do mês corrente (nunca cruza a fronteira do mês, ao contrário de um offset fixo de dias).
    const pastDate = now.startOf("month").toISODate()!;
    const futureDate = now.endOf("month").toISODate()!;

    // Início do mês: cumprido integralmente (8h planeadas = realizadas).
    shifts.seed(ORG, shift({ shiftId: "s1", employeeId: emp.id, workDate: pastDate, actualStartTime: "09:00", actualEndTime: "17:00" }));
    // Fim do mês: só planeado, sem nenhuma marcação — se "hoje" já for o último dia do mês, os 2 turnos coincidem (nesse caso o teste não distingue passado/futuro; aceite, mesmo tipo de fragilidade de relógio real já existente noutros testes deste módulo).
    shifts.seed(ORG, shift({ shiftId: "s2", employeeId: emp.id, workDate: futureDate }));

    const result = await useCase.execute({ organizationId: ORG, year, month });

    const row = result.rows.find((r) => r.employeeId === emp.id)!;
    expect(row.plannedMinutes).toBe(960); // 2 turnos de 8h — informativo, inclui o futuro.
    expect(row.balanceMinutes).toBe(0); // 8h realizadas - 8h planeadas ATÉ HOJE (o turno futuro nunca entra na conta).
  });

  it("regressão: se hr_attendance_rules/hr_attendance_corrections ainda não existirem (migração Fase 2.1 pendente), 'Por colaborador' continua a funcionar", async () => {
    const { employees, shifts, attendanceRules, attendanceCorrections, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ shiftId: "s1", employeeId: emp.id, workDate: "2026-09-05", actualStartTime: "09:00", actualEndTime: "17:00" }));
    jest.spyOn(attendanceRules, "listVersions").mockRejectedValue(new Error('relation "hr_attendance_rules" does not exist'));
    jest.spyOn(attendanceCorrections, "listInRange").mockRejectedValue(new Error('relation "hr_attendance_rule_changes" does not exist'));

    const result = await useCase.execute({ organizationId: ORG, year: 2026, month: 9 });

    expect(result.rows.find((r) => r.employeeId === emp.id)).toBeDefined();
  });

  it("período fechado com snapshot: devolve a foto do momento do fecho, nunca recalcula ao vivo", async () => {
    const { employees, shifts, monthlyClosureRepository, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ employeeId: emp.id, workDate: "2026-09-05", actualStartTime: "09:00", actualEndTime: "17:00" }));

    const frozenSnapshot = { kpis: { employeeCount: 1 }, rows: [{ employeeId: emp.id, employeeName: "Snapshot Congelado" }] };
    await monthlyClosureRepository.save(ORG, MonthlyClosure.openDefault(String(ORG), 2026, 9).close("gestor@angrybox.com", new Date().toISOString(), frozenSnapshot));

    const result = await useCase.execute({ organizationId: ORG, year: 2026, month: 9 });

    // Ignora completamente os turnos reais seedados acima — devolve exatamente o snapshot gravado no fecho.
    expect(result).toEqual(frozenSnapshot);
  });

  it("período aberto (nunca fechado, ou reaberto): sempre calcula ao vivo, mesmo que exista um snapshot de um fecho anterior", async () => {
    const { employees, shifts, monthlyClosureRepository, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ employeeId: emp.id, workDate: "2026-09-05", actualStartTime: "09:00", actualEndTime: "17:00" }));

    const staleSnapshot = { kpis: { employeeCount: 99 }, rows: [] };
    const closed = MonthlyClosure.openDefault(String(ORG), 2026, 9).close("gestor@angrybox.com", new Date().toISOString(), staleSnapshot);
    const reopened = closed.reopen("admin@angrybox.com", "Corrigir um turno", new Date().toISOString());
    await monthlyClosureRepository.save(ORG, reopened);

    const result = await useCase.execute({ organizationId: ORG, year: 2026, month: 9 });

    expect(result.rows.find((r) => r.employeeId === emp.id)).toBeDefined();
    expect(result.kpis.employeeCount).not.toBe(99);
  });
});
