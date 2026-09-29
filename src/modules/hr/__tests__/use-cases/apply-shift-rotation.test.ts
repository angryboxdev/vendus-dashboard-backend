import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { ShiftRotation } from "../../domain/entities/shift-rotation.js";
import { ApplyShiftRotationUseCase } from "../../application/use-cases/apply-shift-rotation.use-case.js";
import { FakeShiftRotationRepository } from "../fakes/fake-shift-rotation-repository.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeHolidayReadAdapter } from "../fakes/fake-holiday-read.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");
const MONDAY = "2026-08-10";

function setup() {
  const rotations = new FakeShiftRotationRepository();
  const workShifts = new FakeWorkShiftRepository();
  const employees = new FakeEmployeeRepository();
  const leaveRead = new FakeLeaveReadAdapter();
  const holidayRead = new FakeHolidayReadAdapter();
  const auditLog = new FakeHrAuditLog();
  const useCase = new ApplyShiftRotationUseCase(rotations, workShifts, employees, leaveRead, holidayRead, auditLog);
  const andres = Employee.create({ fullName: "Andres" });
  const gabriel = Employee.create({ fullName: "Gabriel" });
  employees.seed(ORG, andres);
  employees.seed(ORG, gabriel);
  const rotation = ShiftRotation.create({
    jobRole: "service",
    participantEmployeeIds: [andres.id, gabriel.id],
    patternA: { startTime: "11:30", endTime: "15:30" },
    patternB: { startTime: "17:00", endTime: "23:00" },
    locationId: "loc-1",
    anchorDate: MONDAY,
  });
  rotations.seed(ORG, rotation);
  return { rotations, workShifts, employees, leaveRead, holidayRead, auditLog, useCase, andres, gabriel, rotation };
}

describe("ApplyShiftRotationUseCase", () => {
  it("materializa 1 semana com os 2 participantes em padrões opostos, todos os 7 dias", async () => {
    const { useCase, andres, gabriel, rotation } = setup();

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      rotationId: rotation.id,
      fromWeekStartDate: MONDAY,
      weeks: 1,
    });

    expect(result.created).toHaveLength(14); // 7 dias x 2 participantes
    const andresShifts = result.created.filter((s) => s.employeeId === andres.id);
    const gabrielShifts = result.created.filter((s) => s.employeeId === gabriel.id);
    expect(andresShifts.every((s) => s.startTime === "11:30")).toBe(true);
    expect(gabrielShifts.every((s) => s.startTime === "17:00")).toBe(true);
  });

  it("na semana seguinte os participantes trocam de padrão", async () => {
    const { useCase, andres, gabriel, rotation } = setup();

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      rotationId: rotation.id,
      fromWeekStartDate: "2026-08-17",
      weeks: 1,
    });

    const andresShift = result.created.find((s) => s.employeeId === andres.id)!;
    const gabrielShift = result.created.find((s) => s.employeeId === gabriel.id)!;
    expect(andresShift.startTime).toBe("17:00");
    expect(gabrielShift.startTime).toBe("11:30");
  });

  it("salta um dia de feriado para os dois participantes", async () => {
    const { useCase, holidayRead, rotation } = setup();
    holidayRead.seed(ORG, { date: MONDAY, name: "Feriado" });

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      rotationId: rotation.id,
      fromWeekStartDate: MONDAY,
      weeks: 1,
    });

    expect(result.created.some((s) => s.workDate === MONDAY)).toBe(false);
    expect(result.skippedDates.filter((d) => d === MONDAY)).toHaveLength(2);
  });

  it("nunca sobrescreve um turno manual existente nesse dia/colaborador", async () => {
    const { useCase, workShifts, andres, rotation } = setup();
    const manual = WorkShift.create({
      employeeId: andres.id,
      workDate: MONDAY,
      startTime: "09:00",
      endTime: "13:00",
      locationId: "loc-2",
      source: "manual",
    });
    workShifts.seed(ORG, manual);

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      rotationId: rotation.id,
      fromWeekStartDate: MONDAY,
      weeks: 1,
    });

    expect(result.created.some((s) => s.employeeId === andres.id && s.workDate === MONDAY)).toBe(false);
    expect(result.updated.some((s) => s.employeeId === andres.id && s.workDate === MONDAY)).toBe(false);
    const stillThere = await workShifts.findById(ORG, manual.id);
    expect(stillThere!.startTime).toBe("09:00");
  });

  it("reaplica livremente sobre turnos já gerados pela mesma rotação", async () => {
    const { useCase, rotation } = setup();
    await useCase.execute({ organizationId: ORG, actor: "manager", rotationId: rotation.id, fromWeekStartDate: MONDAY, weeks: 1 });

    const second = await useCase.execute({
      organizationId: ORG,
      actor: "manager",
      rotationId: rotation.id,
      fromWeekStartDate: MONDAY,
      weeks: 1,
    });

    expect(second.created).toHaveLength(0);
    expect(second.updated).toHaveLength(14);
  });

  it("preserva o turno repartido do padrão ao materializar e ao reaplicar", async () => {
    const rotations = new FakeShiftRotationRepository();
    const workShifts = new FakeWorkShiftRepository();
    const employees = new FakeEmployeeRepository();
    const leaveRead = new FakeLeaveReadAdapter();
    const holidayRead = new FakeHolidayReadAdapter();
    const auditLog = new FakeHrAuditLog();
    const useCase = new ApplyShiftRotationUseCase(rotations, workShifts, employees, leaveRead, holidayRead, auditLog);
    const andres = Employee.create({ fullName: "Andres" });
    const gabriel = Employee.create({ fullName: "Gabriel" });
    employees.seed(ORG, andres);
    employees.seed(ORG, gabriel);
    const rotation = ShiftRotation.create({
      jobRole: "service",
      participantEmployeeIds: [andres.id, gabriel.id],
      patternA: { startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" },
      patternB: { startTime: "17:00", endTime: "23:00" },
      locationId: "loc-1",
      anchorDate: MONDAY,
    });
    rotations.seed(ORG, rotation);

    const result = await useCase.execute({ organizationId: ORG, actor: "manager", rotationId: rotation.id, fromWeekStartDate: MONDAY, weeks: 1 });
    const andresShift = result.created.find((s) => s.employeeId === andres.id)!;
    expect(andresShift.secondStartTime).toBe("19:00");
    expect(andresShift.secondEndTime).toBe("23:00");

    const reapplied = await useCase.execute({ organizationId: ORG, actor: "manager", rotationId: rotation.id, fromWeekStartDate: MONDAY, weeks: 1 });
    const andresUpdated = reapplied.updated.find((s) => s.employeeId === andres.id)!;
    expect(andresUpdated.secondStartTime).toBe("19:00");
  });
});
