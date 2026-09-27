import { DateTime } from "luxon";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { GetAttendanceIssueDetailUseCase } from "../../application/use-cases/get-attendance-issue-detail.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakeAttendanceCorrectionRepository } from "../fakes/fake-attendance-correction-repository.js";
import type { ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";

const ORG = mintOrganizationId("org-test");

function shift(overrides: Partial<ShiftOccurrence> = {}): ShiftOccurrence {
  return {
    shiftId: "s1",
    employeeId: "e1",
    workDate: "2026-09-27",
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
  const corrections = new FakeAttendanceCorrectionRepository();
  return {
    employees,
    shifts,
    corrections,
    useCase: new GetAttendanceIssueDetailUseCase(employees, shifts, leave, locations, corrections),
  };
}

describe("GetAttendanceIssueDetailUseCase", () => {
  it("null quando o turno não existe nesse dia", async () => {
    const { useCase } = makeUseCase();
    const result = await useCase.execute({ organizationId: ORG, workDate: "2026-09-27", shiftId: "nao-existe" });
    expect(result).toBeNull();
  });

  it("null quando o turno é Regular (sem pendência) — mesmo critério da lista", async () => {
    const { employees, shifts, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, shift({ employeeId: emp.id, actualStartTime: "09:00", actualEndTime: "17:00" }));

    const result = await useCase.execute({ organizationId: ORG, workDate: "2026-09-27", shiftId: "s1" });
    expect(result).toBeNull();
  });

  it("devolve planeado/registado/resultado + histórico de correções para uma pendência real", async () => {
    const { employees, shifts, corrections, useCase } = makeUseCase();
    const emp = Employee.create({ fullName: "Gabriel Gomes" });
    employees.seed(ORG, emp);
    // Terminado há 2h (não fixo 09:00–17:00) — garante "Em aberto" independente da hora real em que o teste corre.
    const now = DateTime.now().setZone("Europe/Lisbon");
    const recentEnd = now.minus({ hours: 2 });
    const recentStart = recentEnd.minus({ hours: 8 });
    const workDate = recentEnd.toISODate()!;
    shifts.seed(
      ORG,
      shift({
        workDate,
        startTime: recentStart.toFormat("HH:mm"),
        endTime: recentEnd.toFormat("HH:mm"),
        employeeId: emp.id,
        actualStartTime: recentStart.toFormat("HH:mm"),
      }),
    ); // sem saída
    await corrections.record({
      organizationId: ORG,
      workShiftId: "s1",
      employeeId: emp.id,
      workDate,
      correctionType: "add_entry",
      original: null,
      corrected: { status: "worked_as_planned", actualStartTime: recentStart.toFormat("HH:mm"), actualEndTime: null },
      reason: "Esquecimento de marcação",
      notes: null,
      actor: "gestor@angrybox.com",
    });

    const result = await useCase.execute({ organizationId: ORG, workDate, shiftId: "s1" });

    expect(result?.state).toBe("EM_ABERTO");
    expect(result?.periods[0]).toEqual({
      plannedStart: recentStart.toFormat("HH:mm"),
      plannedEnd: recentEnd.toFormat("HH:mm"),
      actualStart: recentStart.toFormat("HH:mm"),
      actualEnd: null,
    });
    expect(result?.corrections).toHaveLength(1);
    expect(result?.corrections[0]!.reason).toBe("Esquecimento de marcação");
  });
});
