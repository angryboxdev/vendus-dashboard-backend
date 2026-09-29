import { DateTime } from "luxon";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { CloseMonthlyPeriodUseCase } from "../../application/use-cases/close-monthly-period.use-case.js";
import { GetMonthlyClosureStatusUseCase } from "../../application/use-cases/get-monthly-closure-status.use-case.js";
import { GetMonthlyAttendanceSummaryUseCase } from "../../application/use-cases/get-monthly-attendance-summary.use-case.js";
import { ListAttendanceIssuesUseCase } from "../../application/use-cases/list-attendance-issues.use-case.js";
import { MonthlyClosureHasBlockersError } from "../../domain/errors.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakeMonthlyClosureRepository } from "../fakes/fake-monthly-closure-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
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
  const monthlyClosureRepository = new FakeMonthlyClosureRepository();
  const auditLog = new FakeHrAuditLog();
  const attendanceRules = new FakeAttendanceRulesRepository();
  const attendanceCorrections = new FakeAttendanceCorrectionRepository();
  const listAttendanceIssues = new ListAttendanceIssuesUseCase(employees, shifts, leave, locations, attendanceRules, attendanceCorrections);
  const getMonthlyClosureStatus = new GetMonthlyClosureStatusUseCase(listAttendanceIssues, monthlyClosureRepository, shifts, leave);
  const getMonthlyAttendanceSummary = new GetMonthlyAttendanceSummaryUseCase(
    employees,
    shifts,
    leave,
    attendanceRules,
    attendanceCorrections,
    monthlyClosureRepository,
  );
  const useCase = new CloseMonthlyPeriodUseCase(getMonthlyClosureStatus, monthlyClosureRepository, auditLog, getMonthlyAttendanceSummary);
  return { employees, shifts, monthlyClosureRepository, auditLog, useCase };
}

describe("CloseMonthlyPeriodUseCase", () => {
  it("bloqueia o fecho quando há pendências críticas (turno em aberto)", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, emp);
    // Terminado há 2h (não fixo 09:00–17:00) — garante "Em aberto" independente da hora real em que o teste corre.
    const now = DateTime.now().setZone("Europe/Lisbon");
    const recentEnd = now.minus({ hours: 2 });
    shifts.seed(
      ORG,
      shift({
        employeeId: emp.id,
        workDate: recentEnd.toISODate()!,
        startTime: recentEnd.minus({ hours: 8 }).toFormat("HH:mm"),
        endTime: recentEnd.toFormat("HH:mm"),
        actualStartTime: recentEnd.minus({ hours: 8 }).toFormat("HH:mm"),
      }),
    ); // sem saída → Em aberto (bloqueador)

    await expect(
      useCase.execute({ organizationId: ORG, actor: "gestor@angrybox.com", year: now.year, month: now.month }),
    ).rejects.toThrow(MonthlyClosureHasBlockersError);
  });

  it("bloqueia o fecho com uma 'possível ausência' não classificada (state AUSENTE — nunca esteve em BLOCKER_STATES antigo, mas é bloqueador explícito na secção 16 da task)", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Lucas Almeida" });
    employees.seed(ORG, emp);
    const now = DateTime.now().setZone("Europe/Lisbon");
    const recentEnd = now.minus({ hours: 2 });
    shifts.seed(
      ORG,
      shift({
        employeeId: emp.id,
        workDate: recentEnd.toISODate()!,
        startTime: recentEnd.minus({ hours: 8 }).toFormat("HH:mm"),
        endTime: recentEnd.toFormat("HH:mm"),
      }),
    ); // nunca chegou, turno já terminou → Ausente/possível ausência

    await expect(
      useCase.execute({ organizationId: ORG, actor: "gestor@angrybox.com", year: now.year, month: now.month }),
    ).rejects.toThrow(MonthlyClosureHasBlockersError);
  });

  it("fecha o período quando não há pendências, regista no histórico, e grava um snapshot", async () => {
    const { employees, shifts, monthlyClosureRepository, auditLog, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ employeeId: emp.id, actualStartTime: "09:00", actualEndTime: "17:00" })); // Regular

    const result = await useCase.execute({ organizationId: ORG, actor: "gestor@angrybox.com", year: 2026, month: 9 });

    expect(result.status).toBe("closed");
    expect(result.closedBy).toBe("gestor@angrybox.com");
    const stored = await monthlyClosureRepository.findByPeriod(ORG, 2026, 9);
    expect(stored?.isClosed).toBe(true);
    expect(stored?.snapshot).not.toBeNull();
    expect((stored?.snapshot as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
    expect(auditLog.entries.some((e) => e.entityType === "monthly_closure" && e.action === "closed")).toBe(true);
  });
});
