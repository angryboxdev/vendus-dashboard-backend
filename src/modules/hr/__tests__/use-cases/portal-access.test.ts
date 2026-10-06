import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Employee } from "../../domain/entities/employee.js";
import { EmployeeNotFoundError, PortalAccessError } from "../../domain/errors.js";
import {
  GetPortalAccessUseCase,
  GrantPortalAccessUseCase,
  RevokePortalAccessUseCase,
  generateTemporaryPassword,
} from "../../application/use-cases/portal-access.use-cases.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeHrAuditLog } from "../fakes/fake-hr-audit-log.js";
import { FakePortalAccount } from "../fakes/fake-portal-account.js";

const ORG = mintOrganizationId("org-test");

// Dados fictícios (RGPD).
function setup(email: string | null = "carla.demo@example.com") {
  const employees = new FakeEmployeeRepository();
  const accounts = new FakePortalAccount();
  const auditLog = new FakeHrAuditLog();
  const employee = Employee.create({ fullName: "Carla Demo", email });
  employees.seed(ORG, employee);
  return {
    employees,
    accounts,
    auditLog,
    employee,
    grant: new GrantPortalAccessUseCase(employees, accounts, auditLog),
    revoke: new RevokePortalAccessUseCase(employees, accounts, auditLog),
    get: new GetPortalAccessUseCase(employees, accounts),
  };
}

const cmd = (employeeId: string, actorIsAdmin = true) => ({ organizationId: ORG, actor: "gestor@example.com", employeeId, actorIsAdmin });

describe("Acesso ao Portal do Colaborador", () => {
  it("sem conta: cria conta 'employee' com palavra-passe temporária, liga à ficha e regista no histórico", async () => {
    const { grant, accounts, auditLog, employee } = setup();

    const result = await grant.execute(cmd(employee.id));

    expect(result).toMatchObject({ hasAccess: true, email: "carla.demo@example.com", accountKind: "employee" });
    expect(result.temporaryPassword).toMatch(/^[A-Za-z2-9]{12}$/);
    const userId = accounts.links.get(employee.id)!;
    expect(accounts.accounts.get(userId)).toMatchObject({ role: "employee", mustChangePassword: true });
    expect(auditLog.entries.map((e) => [e.entityType, e.action, e.employeeId])).toEqual([["portal_access", "granted", employee.id]]);
  });

  it("conta existente (gestor que também é colaborador): liga a MESMA conta, sem criar segunda conta nem mudar o papel", async () => {
    const { grant, accounts, employee } = setup("Carla.Demo@Example.com");
    accounts.seedAccount({ userId: "user-gestor", email: "carla.demo@example.com", role: "manager" });

    const result = await grant.execute(cmd(employee.id));

    expect(result).toEqual({ hasAccess: true, email: "carla.demo@example.com", accountKind: "staff", temporaryPassword: null });
    expect(accounts.accounts.size).toBe(1);
    expect(accounts.accounts.get("user-gestor")!.role).toBe("manager");
    expect(accounts.links.get(employee.id)).toBe("user-gestor");
  });

  it("dar acesso duas vezes não cria uma segunda conta", async () => {
    const { grant, accounts, employee } = setup();
    await grant.execute(cmd(employee.id));
    const second = await grant.execute(cmd(employee.id));
    expect(second.temporaryPassword).toBeNull();
    expect(accounts.accounts.size).toBe(1);
  });

  it("recusa sem email, colaborador inativo ou conta já ligada a outro colaborador", async () => {
    const noEmail = setup(null);
    await expect(noEmail.grant.execute(cmd(noEmail.employee.id))).rejects.toThrow(/Preencha o email/);

    const inactive = setup();
    inactive.employees.seed(ORG, inactive.employee.deactivate());
    await expect(inactive.grant.execute(cmd(inactive.employee.id))).rejects.toThrow(PortalAccessError);

    const taken = setup();
    taken.accounts.seedAccount({ userId: "u1", email: "carla.demo@example.com", role: "employee" });
    taken.accounts.links.set("outro-colaborador", "u1");
    await expect(taken.grant.execute(cmd(taken.employee.id))).rejects.toThrow(/ligada a outro colaborador/);
  });

  it("se a ligação falhar, a conta nova não fica órfã", async () => {
    const { grant, accounts, employee } = setup();
    accounts.failNextLink = true;
    await expect(grant.execute(cmd(employee.id))).rejects.toThrow("falha simulada");
    expect(accounts.accounts.size).toBe(0);
  });

  it("retirar acesso: apaga a conta exclusiva do Portal, mas mantém uma conta de gestão (só desliga)", async () => {
    const portalOnly = setup();
    await portalOnly.grant.execute(cmd(portalOnly.employee.id));
    await portalOnly.revoke.execute(cmd(portalOnly.employee.id));
    expect(portalOnly.accounts.accounts.size).toBe(0);
    expect(await portalOnly.get.execute({ organizationId: ORG, employeeId: portalOnly.employee.id })).toEqual({ hasAccess: false, email: null, accountKind: null });

    const staff = setup();
    staff.accounts.seedAccount({ userId: "user-gestor", email: "carla.demo@example.com", role: "admin" });
    await staff.grant.execute(cmd(staff.employee.id));
    await staff.revoke.execute(cmd(staff.employee.id));
    expect(staff.accounts.accounts.has("user-gestor")).toBe(true);
    expect(staff.accounts.links.size).toBe(0);
  });

  it("colaborador inexistente → EmployeeNotFoundError (nunca cria colaborador)", async () => {
    const { grant, employees } = setup();
    await expect(grant.execute(cmd("nao-existe"))).rejects.toThrow(EmployeeNotFoundError);
    expect(await employees.findById(ORG, "nao-existe")).toBeNull();
  });

  it("palavra-passe temporária sem caracteres ambíguos", () => {
    for (let i = 0; i < 50; i++) expect(generateTemporaryPassword()).not.toMatch(/[01OIl]/);
  });
});

describe("Acesso ao Portal — quem pode (Utilizadores 2.0, U6)", () => {
  it("quem gere Colaboradores (não Admin) cria conta Colaborador, mas não liga nem desliga uma conta de gestão", async () => {
    const created = setup();
    const r = await created.grant.execute(cmd(created.employee.id, false));
    expect(r.accountKind).toBe("employee");

    const staff = setup();
    staff.accounts.seedAccount({ userId: "user-gestor", email: "carla.demo@example.com", role: "manager" });
    await expect(staff.grant.execute(cmd(staff.employee.id, false))).rejects.toThrow(/só um Admin/);
    await staff.grant.execute(cmd(staff.employee.id, true));
    await expect(staff.revoke.execute(cmd(staff.employee.id, false))).rejects.toThrow(/só um Admin/);
  });
});
