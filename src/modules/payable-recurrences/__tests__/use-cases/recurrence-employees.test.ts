import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { UpdateRecurrenceUseCase } from "../../application/use-cases/update-recurrence.use-case.js";
import { PauseRecurrenceUseCase } from "../../application/use-cases/pause-recurrence.use-case.js";
import { ResumeRecurrenceUseCase } from "../../application/use-cases/resume-recurrence.use-case.js";
import { CloseRecurrenceUseCase } from "../../application/use-cases/close-recurrence.use-case.js";
import { ListRecurrenceEmployeesUseCase } from "../../application/use-cases/list-recurrence-employees.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeEmployeeDirectoryRead } from "../fakes/fake-employee-directory-read.js";
import { RecurrenceEmployeeNotFoundError } from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");
const otherOrganizationId = mintOrganizationId("org-b");

// Dados fictícios.
const ANA = { id: "emp-ana", fullName: "Ana Teste", status: "active" as const };
const RUI = { id: "emp-rui", fullName: "Rui Exemplo", status: "inactive" as const };

const SALARY_CMD = {
  organizationId,
  name: "Salário — Ana Teste",
  supplierName: "",
  type: "payroll" as const,
  estimatedAmountCents: 95000,
  dayOfMonth: 28,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

function make() {
  const repo = new FakeRecurrenceRepository();
  const employees = new FakeEmployeeDirectoryRead();
  employees.add(organizationId, RUI);
  employees.add(organizationId, ANA);
  return {
    repo,
    create: new CreateRecurrenceUseCase(repo, employees),
    update: new UpdateRecurrenceUseCase(repo, employees),
    pause: new PauseRecurrenceUseCase(repo),
    resume: new ResumeRecurrenceUseCase(repo),
    close: new CloseRecurrenceUseCase(repo),
    listEmployees: new ListRecurrenceEmployeesUseCase(employees),
  };
}

describe("Recorrências de salários — colaborador associado", () => {
  it("lista os colaboradores da organização (ativos e inativos), por nome", async () => {
    const { listEmployees } = make();
    expect(await listEmployees.execute({ organizationId })).toEqual([ANA, RUI]);
    expect(await listEmployees.execute({ organizationId: otherOrganizationId })).toEqual([]);
  });

  it("cria com colaborador; sem beneficiário escrito, usa o nome do colaborador", async () => {
    const { create } = make();
    const dto = await create.execute({ ...SALARY_CMD, employeeId: ANA.id });
    expect(dto.employeeId).toBe(ANA.id);
    expect(dto.supplierName).toBe("Ana Teste");
  });

  it("mantém o beneficiário escrito quando vem preenchido", async () => {
    const { create } = make();
    const dto = await create.execute({ ...SALARY_CMD, employeeId: ANA.id, supplierName: "Ana T." });
    expect(dto.supplierName).toBe("Ana T.");
  });

  it("recusa colaborador de outra organização ou inexistente", async () => {
    const { create } = make();
    await expect(create.execute({ ...SALARY_CMD, organizationId: otherOrganizationId, employeeId: ANA.id }))
      .rejects.toThrow(RecurrenceEmployeeNotFoundError);
    await expect(create.execute({ ...SALARY_CMD, employeeId: "emp-x" }))
      .rejects.toThrow(RecurrenceEmployeeNotFoundError);
  });

  it("sem colaborador continua a funcionar como antes", async () => {
    const { create } = make();
    const dto = await create.execute({ ...SALARY_CMD, supplierName: "Gabinete Lda" });
    expect(dto.employeeId).toBeNull();
  });

  it("troca e desassocia o colaborador na edição", async () => {
    const { create, update } = make();
    const dto = await create.execute({ ...SALARY_CMD, employeeId: ANA.id });

    const changed = await update.execute({ organizationId, id: dto.id, employeeId: RUI.id, supplierName: "" });
    expect(changed.employeeId).toBe(RUI.id);
    expect(changed.supplierName).toBe("Rui Exemplo");

    const cleared = await update.execute({ organizationId, id: dto.id, employeeId: null, supplierName: "Outro" });
    expect(cleared.employeeId).toBeNull();
    expect(cleared.supplierName).toBe("Outro");
  });

  it("recusa colaborador inexistente na edição", async () => {
    const { create, update } = make();
    const dto = await create.execute({ ...SALARY_CMD, employeeId: ANA.id });
    await expect(update.execute({ organizationId, id: dto.id, employeeId: "emp-x" }))
      .rejects.toThrow(RecurrenceEmployeeNotFoundError);
  });
});

describe("Histórico — datas de pausa e encerramento", () => {
  it("regista a data de pausa e limpa-a ao retomar", async () => {
    const { create, pause, resume } = make();
    const dto = await create.execute({ ...SALARY_CMD, employeeId: ANA.id });
    expect(dto.pausedAt).toBeNull();

    const paused = await pause.execute({ organizationId, id: dto.id });
    expect(paused.pausedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const resumed = await resume.execute({ organizationId, id: dto.id });
    expect(resumed.pausedAt).toBeNull();
  });

  it("encerrar uma pausada mantém a data de pausa e grava a de encerramento", async () => {
    const { create, pause, close } = make();
    const dto = await create.execute({ ...SALARY_CMD, employeeId: ANA.id });
    await pause.execute({ organizationId, id: dto.id });
    const closed = await close.execute({ organizationId, id: dto.id, closedAt: "2026-09-30" });
    expect(closed.status).toBe("closed");
    expect(closed.pausedAt).not.toBeNull();
    expect(closed.closedAt).toBe("2026-09-30");
  });
});
