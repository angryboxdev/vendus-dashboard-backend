import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { DeleteWorkShiftUseCase } from "../../application/use-cases/delete-work-shift.use-case.js";
import { WorkShiftHasAttendanceError, WorkShiftNotFoundError } from "../../domain/errors.js";
import { FakeWorkShiftRepository } from "../fakes/fake-work-shift-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

describe("DeleteWorkShiftUseCase", () => {
  it("apaga um turno sem presença registada", async () => {
    const workShifts = new FakeWorkShiftRepository();
    const auditLog = new FakeHrAuditLog();
    const useCase = new DeleteWorkShiftUseCase(workShifts, auditLog);
    const shift = WorkShift.create({
      employeeId: "emp-1",
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    workShifts.seed(ORG, shift);

    await useCase.execute({ organizationId: ORG, actor: "manager", id: shift.id });

    expect(await workShifts.findById(ORG, shift.id)).toBeNull();
  });

  it("nunca apaga um turno com presença já registada", async () => {
    const workShifts = new FakeWorkShiftRepository();
    const auditLog = new FakeHrAuditLog();
    const useCase = new DeleteWorkShiftUseCase(workShifts, auditLog);
    const shift = WorkShift.create({
      employeeId: "emp-1",
      workDate: "2026-08-10",
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    workShifts.seed(ORG, shift);
    workShifts.seedAttendance(shift.id, "worked_as_planned");

    await expect(useCase.execute({ organizationId: ORG, actor: "manager", id: shift.id })).rejects.toThrow(
      WorkShiftHasAttendanceError,
    );
    expect(await workShifts.findById(ORG, shift.id)).not.toBeNull();
  });

  it("lança WorkShiftNotFoundError para id inexistente", async () => {
    const workShifts = new FakeWorkShiftRepository();
    const auditLog = new FakeHrAuditLog();
    const useCase = new DeleteWorkShiftUseCase(workShifts, auditLog);
    await expect(
      useCase.execute({ organizationId: ORG, actor: "manager", id: "inexistente" }),
    ).rejects.toThrow(WorkShiftNotFoundError);
  });
});
