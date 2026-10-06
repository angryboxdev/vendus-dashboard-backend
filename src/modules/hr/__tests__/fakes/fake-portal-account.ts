import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { OrgAccount, PortalAccountPort } from "../../domain/ports/out/portal-account.port.js";

/** Contas + ligação conta ↔ colaborador em memória (uma organização por teste chega). */
export class FakePortalAccount implements PortalAccountPort {
  readonly accounts = new Map<string, OrgAccount & { mustChangePassword?: boolean; temporaryPassword?: string }>();
  readonly links = new Map<string, string>(); // employeeId → userId
  failNextLink = false;
  private seq = 0;

  seedAccount(account: OrgAccount): void {
    this.accounts.set(account.userId, account);
  }

  async findMemberByEmail(_org: OrganizationId, email: string): Promise<OrgAccount | null> {
    return [...this.accounts.values()].find((a) => a.email === email.toLowerCase()) ?? null;
  }

  async findMemberById(_org: OrganizationId, userId: string): Promise<OrgAccount | null> {
    return this.accounts.get(userId) ?? null;
  }

  async createEmployeeAccount(_org: OrganizationId, email: string, temporaryPassword: string): Promise<string> {
    const userId = `user-new-${++this.seq}`;
    this.accounts.set(userId, { userId, email, role: "employee", mustChangePassword: true, temporaryPassword });
    return userId;
  }

  async deleteEmployeeAccount(_org: OrganizationId, userId: string): Promise<void> {
    if (this.accounts.get(userId)?.role === "employee") this.accounts.delete(userId);
  }

  async findLinkedUserId(_org: OrganizationId, employeeId: string): Promise<string | null> {
    return this.links.get(employeeId) ?? null;
  }

  async findLinkedEmployeeId(_org: OrganizationId, userId: string): Promise<string | null> {
    return [...this.links.entries()].find(([, u]) => u === userId)?.[0] ?? null;
  }

  async link(_org: OrganizationId, employeeId: string, userId: string): Promise<void> {
    if (this.failNextLink) {
      this.failNextLink = false;
      throw new Error("falha simulada");
    }
    this.links.set(employeeId, userId);
  }

  async unlink(_org: OrganizationId, employeeId: string): Promise<void> {
    this.links.delete(employeeId);
  }
}
