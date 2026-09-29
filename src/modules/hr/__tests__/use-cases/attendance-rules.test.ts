import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetAttendanceRulesUseCase } from "../../application/use-cases/get-attendance-rules.use-case.js";
import { UpdateAttendanceRulesUseCase } from "../../application/use-cases/update-attendance-rules.use-case.js";
import { ListAttendanceRuleChangesUseCase } from "../../application/use-cases/list-attendance-rule-changes.use-case.js";
import { DEFAULT_ATTENDANCE_RULES } from "../../domain/entities/attendance-rules.js";
import { FakeAttendanceRulesRepository } from "../fakes/fake-attendance-rules-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";

const ORG = mintOrganizationId("org-test");

function makeUseCases() {
  const repo = new FakeAttendanceRulesRepository();
  const auditLog = new FakeHrAuditLog();
  const getAttendanceRules = new GetAttendanceRulesUseCase(repo);
  const updateAttendanceRules = new UpdateAttendanceRulesUseCase(repo, auditLog, getAttendanceRules);
  const listAttendanceRuleChanges = new ListAttendanceRuleChangesUseCase(repo);
  return { repo, auditLog, getAttendanceRules, updateAttendanceRules, listAttendanceRuleChanges };
}

describe("GetAttendanceRulesUseCase", () => {
  it("sem nenhuma versão configurada, devolve o default (nunca bloqueia à espera de configuração)", async () => {
    const { getAttendanceRules } = makeUseCases();
    const result = await getAttendanceRules.execute({ organizationId: ORG });
    expect(result.entryToleranceMinutes).toBe(DEFAULT_ATTENDANCE_RULES.entryToleranceMinutes);
    expect(result.updatedBy).toBe("—");
  });

  it("devolve a versão vigente, nunca uma futura", async () => {
    const { repo, getAttendanceRules } = makeUseCases();
    repo.seed({ entryToleranceMinutes: 5, effectiveFrom: "2020-01-01", changedBy: "old-manager" });
    repo.seed({ entryToleranceMinutes: 99, effectiveFrom: "2999-01-01", changedBy: "future-manager" });
    const result = await getAttendanceRules.execute({ organizationId: ORG });
    expect(result.entryToleranceMinutes).toBe(5);
    expect(result.updatedBy).toBe("old-manager");
  });
});

describe("UpdateAttendanceRulesUseCase", () => {
  it("insere uma nova versão em vez de sobrescrever a anterior", async () => {
    const { repo, updateAttendanceRules } = makeUseCases();
    repo.seed({ entryToleranceMinutes: 10, effectiveFrom: "2020-01-01" });

    await updateAttendanceRules.execute({
      organizationId: ORG,
      actor: "manager@angrybox.com",
      entryToleranceMinutes: 15,
      earlyExitToleranceMinutes: 5,
      absenceThresholdMinutes: 60,
      preShiftWindowMinutes: 30,
      postShiftWindowMinutes: 60,
    });

    expect(repo.versions).toHaveLength(2);
    expect(repo.versions[0]!.entryToleranceMinutes).toBe(10); // versão antiga preservada, nunca reescrita
  });

  it("grava auditoria com entityType 'attendance_rules'", async () => {
    const { auditLog, updateAttendanceRules } = makeUseCases();
    await updateAttendanceRules.execute({
      organizationId: ORG,
      actor: "manager@angrybox.com",
      entryToleranceMinutes: 15,
      earlyExitToleranceMinutes: 5,
      absenceThresholdMinutes: 60,
      preShiftWindowMinutes: 30,
      postShiftWindowMinutes: 60,
    });
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]!.entityType).toBe("attendance_rules");
  });
});

describe("ListAttendanceRuleChangesUseCase", () => {
  it("a 1ª versão nunca gera entradas de alteração (é a baseline)", async () => {
    const { repo, listAttendanceRuleChanges } = makeUseCases();
    repo.seed({ entryToleranceMinutes: 10, effectiveFrom: "2020-01-01" });
    const result = await listAttendanceRuleChanges.execute({ organizationId: ORG });
    expect(result).toHaveLength(0);
  });

  it("gera 1 entrada por campo alterado entre versões consecutivas", async () => {
    const { repo, listAttendanceRuleChanges } = makeUseCases();
    repo.seed({ entryToleranceMinutes: 10, earlyExitToleranceMinutes: 5, effectiveFrom: "2020-01-01", createdAt: "2020-01-01T00:00:00.000Z" });
    repo.seed({ entryToleranceMinutes: 15, earlyExitToleranceMinutes: 5, effectiveFrom: "2026-09-27", createdAt: "2026-09-27T10:00:00.000Z", changedBy: "manager1" });

    const result = await listAttendanceRuleChanges.execute({ organizationId: ORG });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ field: "entryToleranceMinutes", previousValue: 10, newValue: 15, changedBy: "manager1" });
  });
});
