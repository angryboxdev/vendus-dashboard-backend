import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CorrectShiftAttendanceUseCase } from "../../application/use-cases/correct-shift-attendance.use-case.js";
import { GetAttendanceIssueDetailUseCase } from "../../application/use-cases/get-attendance-issue-detail.use-case.js";
import { AttendanceCorrectionReasonRequiredError, MonthlyClosureLockedError } from "../../domain/errors.js";
import { MonthlyClosure } from "../../domain/entities/monthly-closure.js";
import { FakeAttendanceWriteAdapter } from "../fakes/fake-attendance-write.js";
import { FakeAttendanceCorrectionRepository } from "../fakes/fake-attendance-correction-repository.js";
import { FakeMonthlyClosureRepository } from "../fakes/fake-monthly-closure-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const attendanceWrite = new FakeAttendanceWriteAdapter();
  const attendanceCorrectionRepository = new FakeAttendanceCorrectionRepository();
  const monthlyClosureRepository = new FakeMonthlyClosureRepository();
  const auditLog = new FakeHrAuditLog();
  const employees = new FakeEmployeeRepository();
  const shifts = new FakeShiftAttendanceReadAdapter();
  const leave = new FakeLeaveReadAdapter();
  const locations = new FakeLocationRepository();
  const getAttendanceIssueDetail = new GetAttendanceIssueDetailUseCase(employees, shifts, leave, locations, attendanceCorrectionRepository);
  const useCase = new CorrectShiftAttendanceUseCase(
    attendanceWrite,
    attendanceCorrectionRepository,
    monthlyClosureRepository,
    auditLog,
    getAttendanceIssueDetail,
  );
  return { attendanceWrite, attendanceCorrectionRepository, monthlyClosureRepository, auditLog, useCase };
}

const BASE_COMMAND = {
  organizationId: ORG,
  actor: "gestor@angrybox.com",
  workShiftId: "shift-1",
  attendanceId: null,
  employeeId: "emp-1",
  workDate: "2026-09-27",
  locationId: "loc-1",
  reason: "Esquecimento de marcação",
} as const;

describe("CorrectShiftAttendanceUseCase", () => {
  it("exige motivo — rejeita correção sem motivo", async () => {
    const { useCase } = makeUseCase();
    await expect(
      useCase.execute({ ...BASE_COMMAND, reason: "  ", correctionType: "add_entry", actualStartTime: "09:05" }),
    ).rejects.toThrow(AttendanceCorrectionReasonRequiredError);
  });

  it("adiciona entrada em falta e preserva o valor original (null) na trilha de correções", async () => {
    const { attendanceCorrectionRepository, useCase } = makeUseCase();
    await useCase.execute({ ...BASE_COMMAND, correctionType: "add_entry", actualStartTime: "09:05" });

    expect(attendanceCorrectionRepository.entries).toHaveLength(1);
    const entry = attendanceCorrectionRepository.entries[0]!;
    expect(entry.original).toBeNull();
    expect(entry.corrected?.actualStartTime).toBe("09:05");
    expect(entry.reason).toBe("Esquecimento de marcação");
    expect(entry.actor).toBe("gestor@angrybox.com");
  });

  it("corrigir uma marcação existente preserva o valor original inalterado na trilha (nunca reescreve o passado)", async () => {
    const { attendanceWrite, attendanceCorrectionRepository, useCase } = makeUseCase();
    attendanceWrite.seed({
      id: "att-1",
      workShiftId: "shift-1",
      employeeId: "emp-1",
      workDate: "2026-09-27",
      locationId: "loc-1",
      status: "worked_as_planned",
      actualStartTime: "09:20",
      actualEndTime: null,
      lateMinutes: null,
      registrationSource: "employee_qr",
    });

    await useCase.execute({ ...BASE_COMMAND, attendanceId: "att-1", correctionType: "fix_entry", actualStartTime: "09:05" });

    const entry = attendanceCorrectionRepository.entries[0]!;
    expect(entry.original).toEqual({ status: "worked_as_planned", actualStartTime: "09:20", actualEndTime: null });
    expect(entry.corrected?.actualStartTime).toBe("09:05");

    const updated = await attendanceWrite.findById(ORG, "att-1");
    expect(updated?.actualStartTime).toBe("09:05");
    // A correção nunca apaga o rasto de que a marcação original veio do kiosk do colaborador.
    expect(updated?.registrationSource).toBe("employee_qr");
  });

  it("marcar ausência define status='cancelled' sem mexer nas horas registadas", async () => {
    const { attendanceWrite, useCase } = makeUseCase();
    attendanceWrite.seed({
      id: "att-1",
      workShiftId: "shift-1",
      employeeId: "emp-1",
      workDate: "2026-09-27",
      locationId: "loc-1",
      status: "worked_as_planned",
      actualStartTime: "09:00",
      actualEndTime: null,
      lateMinutes: null,
      registrationSource: "dashboard",
    });

    await useCase.execute({ ...BASE_COMMAND, attendanceId: "att-1", correctionType: "mark_absence" });

    const updated = await attendanceWrite.findById(ORG, "att-1");
    expect(updated?.status).toBe("cancelled");
    expect(updated?.actualStartTime).toBe("09:00");
  });

  it("rejeita qualquer correção num mês já fechado", async () => {
    const { monthlyClosureRepository, useCase } = makeUseCase();
    await monthlyClosureRepository.save(ORG, MonthlyClosure.openDefault(String(ORG), 2026, 9).close("admin@angrybox.com", new Date().toISOString()));

    await expect(
      useCase.execute({ ...BASE_COMMAND, correctionType: "add_entry", actualStartTime: "09:05" }),
    ).rejects.toThrow(MonthlyClosureLockedError);
  });

  it("grava sempre uma entrada no histórico (hr_audit_logs) com o entityType 'attendance_correction'", async () => {
    const { auditLog, useCase } = makeUseCase();
    await useCase.execute({ ...BASE_COMMAND, correctionType: "add_entry", actualStartTime: "09:05" });

    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]!.entityType).toBe("attendance_correction");
    expect(auditLog.entries[0]!.actor).toBe("gestor@angrybox.com");
  });
});
