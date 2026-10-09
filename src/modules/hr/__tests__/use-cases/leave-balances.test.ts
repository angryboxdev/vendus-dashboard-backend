import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Absence, InvalidAbsenceError } from "../../domain/entities/absence.js";
import { Employee } from "../../domain/entities/employee.js";
import { ListLeaveBalancesUseCase, SetLeaveBalanceUseCase } from "../../application/use-cases/absences.use-cases.js";
import { suggestDaysEntitled } from "../../domain/services/leave-balance.service.js";
import { FakeAbsenceRepository } from "../fakes/fake-absence-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakePositionRepository } from "../fakes/fake-position-repository.js";

const ORG = mintOrganizationId("org-test");

function setup() {
  const absences = new FakeAbsenceRepository();
  const employees = new FakeEmployeeRepository();
  const audit = new FakeHrAuditLog();
  const carla = Employee.create({ fullName: "CARLA DEMO", hiredAt: "2020-03-01" });
  const novo = Employee.create({ fullName: "NOVO DEMO", hiredAt: "2026-07-01" });
  employees.seed(ORG, carla);
  employees.seed(ORG, novo);
  const vacation = (employeeId: string, startDate: string, endDate: string, workingDays: number) =>
    absences.seed(Absence.register({ employeeId, type: "vacation", duration: "day", startDate, endDate, workingDays, createdBy: "x" }));
  return {
    absences,
    audit,
    carla,
    novo,
    vacation,
    list: new ListLeaveBalancesUseCase(absences, employees, new FakePositionRepository(), () => "2026-10-07"),
    set: new SetLeaveBalanceUseCase(absences, audit),
  };
}

describe("Saldos de férias", () => {
  it("sugestão: 22 nos anos seguintes; no ano de admissão 2 por mês completo (máx. 20)", () => {
    expect(suggestDaysEntitled(null, 2026)).toBe(22);
    expect(suggestDaysEntitled("2020-03-01", 2026)).toBe(22);
    expect(suggestDaysEntitled("2026-07-01", 2026)).toBe(12);
    expect(suggestDaysEntitled("2027-01-01", 2026)).toBe(0);
  });

  it("lista ativos com gozados, marcados e disponível; sem saldo definido usa a sugestão", async () => {
    const t = setup();
    t.absences.balances.set(`${t.carla.id}:2026`, { daysEntitled: 22, daysCarriedOver: 2 });
    t.vacation(t.carla.id, "2026-08-03", "2026-08-07", 5);
    t.vacation(t.carla.id, "2026-12-21", "2026-12-24", 4);
    const rows = await t.list.execute({ organizationId: ORG, year: 2026 });
    expect(rows.map((r) => [r.employeeName, r.defined, r.daysEntitled, r.daysCarriedOver, r.taken, r.scheduled, r.available])).toEqual([
      ["CARLA DEMO", true, 22, 2, 5, 4, 15],
      ["NOVO DEMO", false, 12, 0, 0, 0, 12],
    ]);
  });

  it("guardar cria/atualiza o saldo, regista no histórico e valida os valores", async () => {
    const t = setup();
    await t.set.execute({ organizationId: ORG, actor: "rh@example.com", employeeId: t.novo.id, year: 2026, daysEntitled: 11, daysCarriedOver: 0 });
    expect(await t.absences.findBalance(ORG, t.novo.id, 2026)).toEqual({ daysEntitled: 11, daysCarriedOver: 0 });
    expect(t.audit.entries.at(-1)).toMatchObject({ action: "balance_updated", employeeId: t.novo.id });
    await expect(t.set.execute({ organizationId: ORG, actor: "x", employeeId: t.novo.id, year: 2026, daysEntitled: -1, daysCarriedOver: 0 })).rejects.toBeInstanceOf(InvalidAbsenceError);
    await expect(t.set.execute({ organizationId: ORG, actor: "x", employeeId: t.novo.id, year: 2026, daysEntitled: 2.5, daysCarriedOver: 0 })).rejects.toBeInstanceOf(InvalidAbsenceError);
  });
});
