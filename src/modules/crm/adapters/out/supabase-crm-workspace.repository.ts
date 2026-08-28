import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  ActionRow, ActionTypeRow, CreateActionInput, CrmWorkspaceRepositoryPort, TagRow, WorkspaceDataset,
} from "../../domain/ports/out/crm-workspace-repository.port.js";

const fail = (scope: string, error: { message: string } | null) => {
  if (error) throw new Error(`${scope}: ${error.message}`);
};
const num = (value: unknown) => value == null ? null : Number(value);

/**
 * Never holds a `SupabaseClient` — receives the scoped-query factory at
 * composition time (D2) and builds a scoped helper per call, so every query
 * in this repository is built through the helper (ticket 07).
 */
export class SupabaseCrmWorkspaceRepository implements CrmWorkspaceRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async loadDataset(organizationId: OrganizationId): Promise<WorkspaceDataset> {
    const scoped = this.scopedQuery(organizationId);
    const [customers, orders, contacts, actions, tags, assignments, scripts, parameters] = await Promise.all([
      scoped.table("crm_customers").select("id,first_name,last_name,email,phone,preferred_channel,birthday,how_found,opt_in,notes,inactive,referred_by,seg07_path,registered_at,manual_followup_date,eatz_registered_at,eatz_last_order_date,eatz_order_count,eatz_total_spent,eatz_avg_ticket,eatz_segment,eatz_marketing_opt_in,eatz_snapshot_at,created_at,updated_at"),
      scoped.table("crm_orders").select("id,customer_id,order_date,total_value,status,notes,created_at"),
      scoped.table("crm_contacts").select("id,customer_id,contacted_at,channel,script_code,direction,status,response,notes,segment_at_time,tags_added,tags_removed,created_at"),
      scoped.table("crm_customer_actions").select("id,customer_id,action_type_code,status,scheduled_for,completed_at,notes,script_code,created_at,crm_action_types(name,color)"),
      scoped.table("crm_tags").select("name,label,color,category,active").order("label"),
      scoped.table("crm_customer_tags").select("customer_id,tag_name"),
      scoped.table("crm_scripts").select("code,name"),
      scoped.table("crm_parameters").select("key,value"),
    ]);
    for (const [scope, result] of [["clientes", customers], ["pedidos", orders], ["contactos", contacts], ["ações", actions], ["tags", tags], ["tags de clientes", assignments], ["scripts", scripts], ["parâmetros", parameters]] as const) fail(`Erro ao carregar ${scope}`, result.error);
    return {
      customers: (customers.data ?? []).map((r: any) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone,
        preferredChannel: r.preferred_channel, birthday: r.birthday, howFound: r.how_found, optIn: r.opt_in, notes: r.notes,
        referredBy: r.referred_by, seg07Path: r.seg07_path, manualFollowupDate: r.manual_followup_date,
        inactive: r.inactive, registeredAt: r.registered_at, eatzRegisteredAt: r.eatz_registered_at,
        eatzLastOrderDate: r.eatz_last_order_date, eatzOrderCount: r.eatz_order_count == null ? null : Number(r.eatz_order_count),
        eatzTotalSpent: num(r.eatz_total_spent), eatzAvgTicket: num(r.eatz_avg_ticket), eatzSegment: r.eatz_segment,
        eatzMarketingOptIn: r.eatz_marketing_opt_in, eatzSnapshotAt: r.eatz_snapshot_at, createdAt: r.created_at, updatedAt: r.updated_at })),
      orders: (orders.data ?? []).map((r: any) => ({ id: r.id, customerId: r.customer_id, orderDate: r.order_date, amount: Number(r.total_value), status: r.status, notes: r.notes, createdAt: r.created_at })),
      contacts: (contacts.data ?? []).map((r: any) => ({ id: r.id, customerId: r.customer_id, contactedAt: r.contacted_at, channel: r.channel,
        scriptCode: r.script_code, direction: r.direction, status: r.status, response: r.response, notes: r.notes,
        segmentAtTime: r.segment_at_time, tagsAdded: r.tags_added ?? [], tagsRemoved: r.tags_removed ?? [], createdAt: r.created_at })),
      actions: (actions.data ?? []).map((r: any) => this.mapAction(r)),
      tags: (tags.data ?? []).map((r: any) => ({ name: r.name, label: r.label ?? r.name, color: r.color, category: r.category, active: r.active ?? true })),
      assignments: (assignments.data ?? []).map((r: any) => ({ customerId: r.customer_id, tagName: r.tag_name })),
      scripts: (scripts.data ?? []).map((r: any) => ({ code: r.code, name: r.name })),
      parameters: Object.fromEntries((parameters.data ?? []).map((r: any) => [r.key, r.value])),
    };
  }

  async listActionTypes(organizationId: OrganizationId): Promise<ActionTypeRow[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("crm_action_types").select("code,name,color,active,system").order("name");
    fail("Erro ao listar tipos de ação", error); return (data ?? []) as unknown as ActionTypeRow[];
  }
  async createActionType(organizationId: OrganizationId, input: Omit<ActionTypeRow, "system">): Promise<ActionTypeRow> {
    const { data, error } = await this.scopedQuery(organizationId).table("crm_action_types").insert({ code: input.code, name: input.name, color: input.color, active: input.active, system: false }).select("code,name,color,active,system").single();
    fail("Erro ao criar tipo de ação", error); return data as unknown as ActionTypeRow;
  }
  async updateActionType(organizationId: OrganizationId, code: string, input: { name: string; color?: string | undefined }): Promise<ActionTypeRow> {
    const changes: { name: string; color?: string; updated_at: string } = { name: input.name, updated_at: new Date().toISOString() };
    if (input.color !== undefined) changes.color = input.color;
    const { data, error } = await this.scopedQuery(organizationId).table("crm_action_types").update(changes).eq("code", code)
      .select("code,name,color,active,system").single();
    fail("Erro ao editar tipo de ação", error); return data as unknown as ActionTypeRow;
  }
  async createActions(organizationId: OrganizationId, input: CreateActionInput): Promise<ActionRow[]> {
    const rows = input.customerIds.map((customerId) => ({ customer_id: customerId, action_type_code: input.actionTypeCode,
      status: input.status, scheduled_for: input.scheduledFor, completed_at: input.completedAt, notes: input.notes,
      script_code: input.scriptCode, created_by: input.createdBy }));
    const { data, error } = await this.scopedQuery(organizationId).table("crm_customer_actions").insert(rows)
      .select("id,customer_id,action_type_code,status,scheduled_for,completed_at,notes,script_code,created_at,crm_action_types(name,color)");
    fail("Erro ao criar ações", error); return (data ?? []).map((row: any) => this.mapAction(row));
  }
  async completeAction(organizationId: OrganizationId, id: string, completedAt: string): Promise<ActionRow> {
    const { data, error } = await this.scopedQuery(organizationId).table("crm_customer_actions")
      .update({ status: "completed", completed_at: completedAt, updated_at: new Date().toISOString() })
      .eq("id", id).eq("status", "pending")
      .select("id,customer_id,action_type_code,status,scheduled_for,completed_at,notes,script_code,created_at,crm_action_types(name,color)")
      .single();
    fail("Erro ao concluir ação pendente", error); return this.mapAction(data);
  }
  completeActions(organizationId: OrganizationId, actions: { id: string; completedAt: string }[]): Promise<ActionRow[]> {
    return Promise.all(actions.map((action) => this.completeAction(organizationId, action.id, action.completedAt)));
  }
  async listCustomerActions(organizationId: OrganizationId, customerId: string, limit: number, offset: number): Promise<{ pending: ActionRow | null; history: ActionRow[]; total: number }> {
    const select = "id,customer_id,action_type_code,status,scheduled_for,completed_at,notes,script_code,created_at,crm_action_types(name,color)";
    const scoped = this.scopedQuery(organizationId);
    const [pendingResult, historyResult] = await Promise.all([
      scoped.table("crm_customer_actions").select(select).eq("customer_id", customerId).eq("status", "pending").order("scheduled_for", { ascending: true }).limit(1).maybeSingle(),
      scoped.table("crm_customer_actions").select(select, { count: "exact" }).eq("customer_id", customerId).in("status", ["completed", "cancelled"]).order("completed_at", { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1),
    ]);
    fail("Erro ao carregar próxima ação", pendingResult.error); fail("Erro ao carregar histórico de ações", historyResult.error);
    return { pending: pendingResult.data ? this.mapAction(pendingResult.data) : null,
      history: (historyResult.data ?? []).map((row: any) => this.mapAction(row)), total: historyResult.count ?? 0 };
  }
  async createTag(organizationId: OrganizationId, input: { name: string; label: string; color: string; category: string }): Promise<TagRow> {
    const { data, error } = await this.scopedQuery(organizationId).table("crm_tags").insert(input).select("name,label,color,category,active").single();
    fail("Erro ao criar tag", error); return data as unknown as TagRow;
  }
  async updateTags(organizationId: OrganizationId, customerIds: string[], add: string[], remove: string[]): Promise<void> {
    const scoped = this.scopedQuery(organizationId);
    if (add.length) { const { error } = await scoped.table("crm_customer_tags").upsert(customerIds.flatMap((customerId) => add.map((tagName) => ({ customer_id: customerId, tag_name: tagName }))), { onConflict: "customer_id,tag_name" }); fail("Erro ao adicionar tags", error); }
    if (remove.length) { const { error } = await scoped.table("crm_customer_tags").delete().in("customer_id", customerIds).in("tag_name", remove); fail("Erro ao remover tags", error); }
  }
  async setInactive(organizationId: OrganizationId, customerIds: string[], inactive: boolean): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("crm_customers").update({ inactive, updated_at: new Date().toISOString() }).in("id", customerIds);
    fail("Erro ao alterar estado dos clientes", error);
  }
  private mapAction(r: any): ActionRow {
    const relation = Array.isArray(r.crm_action_types) ? r.crm_action_types[0] : r.crm_action_types;
    return { id: r.id, customerId: r.customer_id, actionTypeCode: r.action_type_code,
      actionTypeName: relation?.name ?? r.action_type_code, actionTypeColor: relation?.color ?? "#64748b",
      status: r.status, scheduledFor: r.scheduled_for, completedAt: r.completed_at,
      notes: r.notes, scriptCode: r.script_code, createdAt: r.created_at };
  }
}
