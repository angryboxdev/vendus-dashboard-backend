import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ReopenMonthlyPeriodUseCase } from "../../application/use-cases/reopen-monthly-period.use-case.js";
import { GetMonthlyClosureStatusUseCase } from "../../application/use-cases/get-monthly-closure-status.use-case.js";
import { ListAttendanceIssuesUseCase } from "../../application/use-cases/list-attendance-issues.use-case.js";
import { MonthlyClosure } from "../../domain/entities/monthly-closure.js";
import { MonthlyClosureNotFoundError, MonthlyClosureReopenReasonRequiredError } from "../../domain/errors.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { FakeMonthlyClosureRepository } from "../fakes/fake-monthly-closure-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakeAttendanceRulesRepository } from "../fakes/fake-attendance-rules-repository.js";
import { FakeAttendanceCorrectionRepository } from "../fakes/fake-attendance-correction-repository.js";

const ORG = mintOrganizationId("org-test");

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
  const useCase = new ReopenMonthlyPeriodUseCase(monthlyClosureRepository, auditLog, getMonthlyClosureStatus);
  return { monthlyClosureRepository, auditLog, useCase };
}

describe("ReopenMonthlyPeriodUseCase", () => {
  it("exige motivo explícito", async () => {
    const { monthlyClosureRepository, useCase } = makeUseCase();
    await monthlyClosureRepository.save(ORG, MonthlyClosure.openDefault(String(ORG), 2026, 9).close("gestor@angrybox.com", new Date().toISOString()));

    await expect(useCase.execute({ organizationId: ORG, actor: "admin@angrybox.com", year: 2026, month: 9, reason: "" })).rejects.toThrow(
      MonthlyClosureReopenReasonRequiredError,
    );
  });

  it("rejeita reabrir um período que nunca foi fechado", async () => {
    const { useCase } = makeUseCase();
    await expect(
      useCase.execute({ organizationId: ORG, actor: "admin@angrybox.com", year: 2026, month: 9, reason: "Correção necessária" }),
    ).rejects.toThrow(MonthlyClosureNotFoundError);
  });

  it("reabre com motivo, regista quem e porquê", async () => {
    const { monthlyClosureRepository, auditLog, useCase } = makeUseCase();
    await monthlyClosureRepository.save(ORG, MonthlyClosure.openDefault(String(ORG), 2026, 9).close("gestor@angrybox.com", new Date().toISOString()));

    const result = await useCase.execute({
      organizationId: ORG,
      actor: "admin@angrybox.com",
      year: 2026,
      month: 9,
      reason: "Falta corrigir um turno",
    });

    expect(result.status).toBe("open");
    expect(result.reopenedBy).toBe("admin@angrybox.com");
    expect(result.reopenReason).toBe("Falta corrigir um turno");
    expect(auditLog.entries.some((e) => e.entityType === "monthly_closure" && e.action === "reopened")).toBe(true);
  });
});
