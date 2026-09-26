import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { GetHrOverviewUseCase } from "../../application/use-cases/get-hr-overview.use-case.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeEmployeeDocumentRepository } from "../fakes/fake-employee-document-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakePaymentReadAdapter } from "../fakes/fake-payment-read.js";
import type { ShiftAttendanceReadPort } from "../../domain/ports/out/shift-attendance-read.port.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase(overrides: { shiftAttendanceRead?: ShiftAttendanceReadPort } = {}) {
  const employees = new FakeEmployeeRepository();
  const documents = new FakeEmployeeDocumentRepository();
  const shifts = overrides.shiftAttendanceRead ?? new FakeShiftAttendanceReadAdapter();
  const leave = new FakeLeaveReadAdapter();
  const payments = new FakePaymentReadAdapter();
  return {
    employees,
    documents,
    shifts,
    leave,
    payments,
    useCase: new GetHrOverviewUseCase(employees, documents, shifts, leave, payments),
  };
}

describe("GetHrOverviewUseCase", () => {
  it("bloco 'team': ativos, admissões este mês, incompletos", async () => {
    const { employees, useCase } = makeUseCase();
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-05`;
    employees.seed(ORG, Employee.create({ fullName: "Ativo Completo", hiredAt: "2020-01-01" }));
    employees.seed(ORG, Employee.create({ fullName: "Admitido Este Mês", hiredAt: thisMonth }));
    employees.seed(ORG, Employee.create({ fullName: "Inativo" }).deactivate());

    const result = await useCase.execute({ organizationId: ORG });

    expect(result.team.status).toBe("ok");
    if (result.team.status === "ok") {
      expect(result.team.data.activeEmployees).toBe(2);
      expect(result.team.data.admissionsThisMonth).toBe(1);
      expect(result.team.data.incompleteProfiles).toBe(2); // nenhum dos dois ativos tem perfil 100% completo
    }
  });

  it("uma fonte a falhar não derruba as outras — 'team' fica indisponível mas 'pending' continua ok", async () => {
    const failingEmployees = {
      findById: async () => null,
      findMany: async () => {
        throw new Error("falha simulada na leitura de funcionários");
      },
      create: async (_o: unknown, e: unknown) => e,
      update: async (_o: unknown, e: unknown) => e,
    };
    const { payments, useCase } = makeUseCase();
    // @ts-expect-error — fake mínimo só para este teste de robustez
    const useCaseWithFailingEmployees = new GetHrOverviewUseCase(
      failingEmployees,
      new FakeEmployeeDocumentRepository(),
      new FakeShiftAttendanceReadAdapter(),
      new FakeLeaveReadAdapter(),
      payments,
    );
    payments.seedUnpaidCount(ORG, 3);

    const result = await useCaseWithFailingEmployees.execute({ organizationId: ORG });

    expect(result.team.status).toBe("unavailable");
    expect(result.pending.status).toBe("ok");
    if (result.pending.status === "ok") {
      expect(result.pending.data.unpaidPaymentsCount).toBe(3);
    }
  });

  it("nunca escreve em nenhuma fonte — os ports de leitura desta fase não expõem sequer um método de escrita", async () => {
    const { shifts, leave, payments } = makeUseCase();
    expect(Object.keys(shifts)).not.toContain("update");
    expect(Object.keys(leave)).not.toContain("update");
    expect(Object.keys(payments)).not.toContain("update");
  });

  it("generatedAt e scope são sempre devolvidos, mesmo com tudo indisponível", async () => {
    const failing = {
      findMany: async () => {
        throw new Error("x");
      },
    };
    const failingShifts = {
      findShiftsInRange: async () => {
        throw new Error("x");
      },
    };
    const failingLeave = {
      findActiveOnDate: async () => {
        throw new Error("x");
      },
    };
    const failingPayments = {
      countUnpaid: async () => {
        throw new Error("x");
      },
    };
    // @ts-expect-error — fakes mínimos só para este teste
    const useCase = new GetHrOverviewUseCase(failing, failing, failingShifts, failingLeave, failingPayments);
    const result = await useCase.execute({ organizationId: ORG });
    expect(result.generatedAt).toBeTruthy();
    expect(result.scope.organizationId).toBe(String(ORG));
    expect(result.team.status).toBe("unavailable");
    expect(result.today.status).toBe("unavailable");
    expect(result.pending.status).toBe("unavailable");
    expect(result.operation.status).toBe("unavailable");
  });
});
