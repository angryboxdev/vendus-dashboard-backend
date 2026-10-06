import { randomInt, randomUUID } from "crypto";
import { EmployeeNotFoundError, PortalAccessError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { OrgAccount, PortalAccountPort } from "../../domain/ports/out/portal-account.port.js";
import type {
  GetPortalAccessPort,
  GrantPortalAccessPort,
  GrantPortalAccessResultDTO,
  PortalAccessCommand,
  PortalAccessDTO,
  RevokePortalAccessPort,
} from "../../domain/ports/in/portal-access.ports.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

/** Sem caracteres ambíguos (0/O, 1/l/I) — é lida e copiada à mão pelo colaborador. */
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateTemporaryPassword(length = 12): string {
  return Array.from({ length }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join("");
}

function toDto(account: OrgAccount | null): PortalAccessDTO {
  if (!account) return { hasAccess: false, email: null, accountKind: null };
  return { hasAccess: true, email: account.email, accountKind: account.role === "employee" ? "employee" : "staff" };
}

async function linkedAccount(accounts: PortalAccountPort, organizationId: OrganizationId, employeeId: string): Promise<OrgAccount | null> {
  const userId = await accounts.findLinkedUserId(organizationId, employeeId);
  return userId ? accounts.findMemberById(organizationId, userId) : null;
}

export class GetPortalAccessUseCase implements GetPortalAccessPort {
  constructor(
    private readonly employees: EmployeeRepositoryPort,
    private readonly accounts: PortalAccountPort,
  ) {}

  async execute(query: { organizationId: OrganizationId; employeeId: string }): Promise<PortalAccessDTO> {
    const employee = await this.employees.findById(query.organizationId, query.employeeId);
    if (!employee) throw new EmployeeNotFoundError(query.employeeId);
    return toDto(await linkedAccount(this.accounts, query.organizationId, query.employeeId));
  }
}

/**
 * "Dar acesso ao Portal" (ticket 02, decisões P2–P4). Se já existe um membro
 * da organização com o email do colaborador, liga essa conta (um gestor que
 * também é colaborador mantém a sua conta e o seu papel — nunca uma segunda
 * conta). Caso contrário cria uma conta `employee` com palavra-passe
 * temporária. Nunca cria um colaborador. Idempotente: se já tem acesso,
 * devolve o estado atual.
 */
export class GrantPortalAccessUseCase implements GrantPortalAccessPort {
  constructor(
    private readonly employees: EmployeeRepositoryPort,
    private readonly accounts: PortalAccountPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: PortalAccessCommand): Promise<GrantPortalAccessResultDTO> {
    const { organizationId, employeeId } = command;
    const employee = await this.employees.findById(organizationId, employeeId);
    if (!employee) throw new EmployeeNotFoundError(employeeId);

    const current = await linkedAccount(this.accounts, organizationId, employeeId);
    if (current) return { ...toDto(current), temporaryPassword: null };

    if (employee.status !== "active") throw new PortalAccessError("Só colaboradores ativos podem ter acesso ao Portal");
    const email = employee.email?.trim().toLowerCase();
    if (!email) throw new PortalAccessError("Preencha o email do colaborador na ficha antes de dar acesso ao Portal");

    const existing = await this.accounts.findMemberByEmail(organizationId, email);
    let account: OrgAccount;
    let temporaryPassword: string | null = null;
    if (existing) {
      const otherEmployee = await this.accounts.findLinkedEmployeeId(organizationId, existing.userId);
      if (otherEmployee && otherEmployee !== employeeId) {
        throw new PortalAccessError("Esta conta já está ligada a outro colaborador");
      }
      account = existing;
    } else {
      temporaryPassword = generateTemporaryPassword();
      const userId = await this.accounts.createEmployeeAccount(organizationId, email, temporaryPassword);
      account = { userId, email, role: "employee" };
    }

    try {
      await this.accounts.link(organizationId, employeeId, account.userId);
    } catch (e) {
      // Não deixa uma conta nova órfã se a ligação falhar.
      if (temporaryPassword) await this.accounts.deleteEmployeeAccount(organizationId, account.userId);
      throw e;
    }

    await this.auditLog.record({
      organizationId,
      actor: command.actor,
      entityType: "portal_access",
      entityId: employeeId,
      employeeId,
      action: "granted",
      description: temporaryPassword
        ? `Acesso ao Portal criado (conta nova ${email})`
        : `Acesso ao Portal: ligada a conta existente ${email} (${account.role})`,
      correlationId: randomUUID(),
    });

    return { ...toDto(account), temporaryPassword };
  }
}

/**
 * Retira o acesso ao Portal: desliga a conta da ficha. Uma conta criada só
 * para o Portal (`employee`) é apagada; uma conta de gestão mantém-se — só
 * deixa de estar ligada à ficha.
 */
export class RevokePortalAccessUseCase implements RevokePortalAccessPort {
  constructor(
    private readonly employees: EmployeeRepositoryPort,
    private readonly accounts: PortalAccountPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: PortalAccessCommand): Promise<void> {
    const { organizationId, employeeId } = command;
    const employee = await this.employees.findById(organizationId, employeeId);
    if (!employee) throw new EmployeeNotFoundError(employeeId);

    const account = await linkedAccount(this.accounts, organizationId, employeeId);
    await this.accounts.unlink(organizationId, employeeId);
    if (!account) return;
    if (account.role === "employee") await this.accounts.deleteEmployeeAccount(organizationId, account.userId);

    await this.auditLog.record({
      organizationId,
      actor: command.actor,
      entityType: "portal_access",
      entityId: employeeId,
      employeeId,
      action: "revoked",
      description:
        account.role === "employee"
          ? `Acesso ao Portal retirado (conta ${account.email} apagada)`
          : `Acesso ao Portal retirado (a conta ${account.email} mantém-se, já não está ligada à ficha)`,
      correlationId: randomUUID(),
    });
  }
}
