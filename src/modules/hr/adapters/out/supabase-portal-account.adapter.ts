import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { authAdmin } from "../../../../infra/scoped-db/auth-admin.js";
import type { OrgAccount, PortalAccountPort } from "../../domain/ports/out/portal-account.port.js";

interface MemberRow {
  user_id: string;
  role: string;
}

/**
 * Contas do Portal: Supabase Auth (`authAdmin`) + `org_members` +
 * `hr_employees.user_id`, sempre pelo scoped query (a organização vem do
 * pedido, nunca do body). O PostgREST não junta com o schema `auth`, por
 * isso os emails são resolvidos pela listagem paginada de utilizadores —
 * mesmo padrão de `authRoutes` (uma organização tem dezenas de contas).
 */
export class SupabasePortalAccountAdapter implements PortalAccountPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  private async members(organizationId: OrganizationId): Promise<MemberRow[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("org_members").select("user_id, role");
    if (error) throw new Error(error.message);
    return (data as unknown as MemberRow[] | null) ?? [];
  }

  private async emailsById(ids: Set<string>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const perPage = 1000;
    for (let page = 1; out.size < ids.size; page++) {
      const { data, error } = await authAdmin.listUsers(page, perPage);
      if (error) throw new Error(error.message);
      for (const user of data.users) if (ids.has(user.id)) out.set(user.id, (user.email ?? "").toLowerCase());
      if (data.users.length < perPage) break;
    }
    return out;
  }

  async findMemberByEmail(organizationId: OrganizationId, email: string): Promise<OrgAccount | null> {
    const members = await this.members(organizationId);
    if (members.length === 0) return null;
    const emails = await this.emailsById(new Set(members.map((m) => m.user_id)));
    const wanted = email.trim().toLowerCase();
    const member = members.find((m) => emails.get(m.user_id) === wanted);
    return member ? { userId: member.user_id, email: wanted, role: member.role } : null;
  }

  async findMemberById(organizationId: OrganizationId, userId: string): Promise<OrgAccount | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("org_members")
      .select("user_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const member = data as unknown as MemberRow;
    const { data: user, error: userError } = await authAdmin.getUserById(userId);
    if (userError) throw new Error(userError.message);
    return { userId, email: (user.user?.email ?? "").toLowerCase(), role: member.role };
  }

  async createEmployeeAccount(organizationId: OrganizationId, email: string, temporaryPassword: string): Promise<string> {
    const { data, error } = await authAdmin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });
    if (error) {
      // Email já registado noutra organização: não se reutiliza uma conta alheia.
      throw new Error(
        error.message.toLowerCase().includes("already")
          ? "Este email já tem uma conta noutra organização — use outro email na ficha"
          : error.message,
      );
    }
    const userId = data.user.id;
    const { error: memberError } = await this.scopedQuery(organizationId)
      .table("org_members")
      .insert({ user_id: userId, role: "employee" });
    if (memberError) {
      await authAdmin.deleteUser(userId);
      throw new Error(memberError.message);
    }
    return userId;
  }

  async deleteEmployeeAccount(organizationId: OrganizationId, userId: string): Promise<void> {
    const member = await this.findMemberById(organizationId, userId);
    // Só apaga contas exclusivas do Portal desta organização — nunca uma conta de gestão.
    if (!member || member.role !== "employee") return;
    const { error } = await authAdmin.deleteUser(userId); // org_members cai em cascata
    if (error) throw new Error(error.message);
  }

  async findLinkedUserId(organizationId: OrganizationId, employeeId: string): Promise<string | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employees")
      .select("user_id")
      .eq("id", employeeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as { user_id: string | null } | null)?.user_id ?? null;
  }

  async findLinkedEmployeeId(organizationId: OrganizationId, userId: string): Promise<string | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employees")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as { id: string } | null)?.id ?? null;
  }

  async link(organizationId: OrganizationId, employeeId: string, userId: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_employees").update({ user_id: userId }).eq("id", employeeId);
    if (error) throw new Error(error.message);
  }

  async unlink(organizationId: OrganizationId, employeeId: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_employees").update({ user_id: null }).eq("id", employeeId);
    if (error) throw new Error(error.message);
  }
}
