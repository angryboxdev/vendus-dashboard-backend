import { DateTime } from "luxon";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { ListAttendanceIssuesUseCase } from "../../application/use-cases/list-attendance-issues.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakeAttendanceRulesRepository } from "../fakes/fake-attendance-rules-repository.js";
import { FakeAttendanceCorrectionRepository } from "../fakes/fake-attendance-correction-repository.js";
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
  const locations = new FakeLocationRepository();
  const attendanceRules = new FakeAttendanceRulesRepository();
  const attendanceCorrections = new FakeAttendanceCorrectionRepository();
  return {
    employees,
    shifts,
    leave,
    locations,
    attendanceRules,
    attendanceCorrections,
    useCase: new ListAttendanceIssuesUseCase(employees, shifts, leave, locations, attendanceRules, attendanceCorrections),
  };
}

describe("ListAttendanceIssuesUseCase", () => {
  it("só devolve turnos com pendência, com nome do colaborador e do local resolvidos", async () => {
    const { employees, shifts, locations, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, emp);
    locations.seed(ORG, [Location.reconstitute({ id: "loc1", name: "Loja MBS", code: "MBS", timezone: "Europe/Lisbon", isActive: true })]);
    // Terminado há 2h (não fixo 09:00–17:00) — garante "Em aberto" independente da hora real em que o teste corre.
    const now = DateTime.now().setZone("Europe/Lisbon");
    const recentEnd = now.minus({ hours: 2 });
    const recentStart = recentEnd.minus({ hours: 8 });
    shifts.seed(
      ORG,
      shift({
        shiftId: "s1",
        employeeId: emp.id,
        workDate: recentEnd.toISODate()!,
        startTime: recentStart.toFormat("HH:mm"),
        endTime: recentEnd.toFormat("HH:mm"),
        actualStartTime: recentStart.toFormat("HH:mm"),
      }),
    ); // sem saída → pendência
    shifts.seed(
      ORG,
      shift({ shiftId: "s2", employeeId: emp.id, workDate: recentEnd.toISODate()!, actualStartTime: "09:00", actualEndTime: "17:00" }),
    ); // regular

    const result = await useCase.execute({ organizationId: ORG, year: now.year, month: now.month });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.employeeName).toBe("Gabriel Gomes");
    expect(result.items[0]!.locationName).toBe("Loja MBS");
    expect(result.items[0]!.state).toBe("EM_ABERTO");
  });

  it("KPIs: todos escopados a reviewStatus 'pending' (task 'Por Colaborador', secção 3 — Conferência é uma fila, não um resumo do período)", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ shiftId: "s1", employeeId: emp.id, workDate: "2026-09-05", actualStartTime: "09:18", actualEndTime: "17:00", attendanceStatus: "late", lateMinutes: 18 }));

    const result = await useCase.execute({ organizationId: ORG, year: 2026, month: 9 });

    expect(result.kpis.pendingCount).toBe(1);
    // Fase 2.1 — classificação automática por tolerância (default 10 min): 18 min de atraso real excede a tolerância.
    expect(result.kpis.lateDaysCount).toBe(1);
    expect(result.kpis.lateOccurrencesCount).toBe(1);
    expect(result.kpis.lateMinutesTotal).toBe(18);
    expect(result.kpis.possibleAbsencesCount).toBe(0);
    expect(result.kpis.noExitCount).toBe(0);
    expect(result.kpis.conflictsCount).toBe(0);
  });

  it("KPIs ignoram ocorrências já conferidas (reviewStatus 'conferred') — Conferência é só a fila de pendências", async () => {
    const { employees, shifts, attendanceCorrections, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ shiftId: "s1", employeeId: emp.id, workDate: "2026-09-05", actualStartTime: "09:18", actualEndTime: "17:00" }));
    await attendanceCorrections.record({
      organizationId: ORG,
      workShiftId: "s1",
      employeeId: emp.id,
      workDate: "2026-09-05",
      correctionType: "keep_as_is",
      original: null,
      corrected: null,
      reason: "Confirmado",
      notes: null,
      actor: "gestor@angrybox.com",
    });

    const result = await useCase.execute({ organizationId: ORG, year: 2026, month: 9 });

    expect(result.items[0]!.reviewStatus).toBe("conferred");
    expect(result.kpis.pendingCount).toBe(0);
    expect(result.kpis.lateDaysCount).toBe(0);
    expect(result.kpis.lateMinutesTotal).toBe(0);
  });

  it("presença sem escala aparece na lista mesmo sem nenhum turno planeado", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "João Victor" });
    employees.seed(ORG, emp);
    shifts.seedUnscheduled(ORG, {
      attendanceId: "att-1",
      employeeId: emp.id,
      workDate: "2026-09-10",
      locationId: "loc1",
      attendanceStatus: "worked_as_planned",
      actualStartTime: "10:00",
      actualEndTime: "18:00",
      lateMinutes: null,
    });

    const result = await useCase.execute({ organizationId: ORG, year: 2026, month: 9 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.state).toBe("CONFLITO");
    expect(result.items[0]!.occurrenceLabel).toBe("Presença sem escala");
  });

  it("regressão: se hr_attendance_rules/hr_attendance_corrections ainda não existirem (migração Fase 2.1 pendente), a Conferência continua a funcionar — nunca derruba o que já era Fase 2", async () => {
    const { employees, shifts, attendanceRules, attendanceCorrections, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Carlos Andrés" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ shiftId: "s1", employeeId: emp.id, workDate: "2026-09-05", attendanceStatus: "late", lateMinutes: 18 }));
    jest.spyOn(attendanceRules, "listVersions").mockRejectedValue(new Error('relation "hr_attendance_rules" does not exist'));
    jest.spyOn(attendanceCorrections, "listInRange").mockRejectedValue(new Error('relation "hr_attendance_rule_changes" does not exist'));

    const result = await useCase.execute({ organizationId: ORG, year: 2026, month: 9 });

    expect(result.items).toHaveLength(1);
    expect(result.kpis.pendingCount).toBe(1);
  });
});
