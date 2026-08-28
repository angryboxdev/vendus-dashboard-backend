import { z } from "zod";
import type { OrganizationId } from "../../../kernel/organization-id.js";
import { calculateCustomerStatus, type CustomerStatusThresholds } from "../domain/customer-status.js";
import type { ActionRow, CrmWorkspaceRepositoryPort, WorkspaceDataset } from "../domain/ports/out/crm-workspace-repository.port.js";

const querySchema = z.object({
  search: z.string().optional(), status: z.enum(["new", "recurring", "vip"]).optional(),
  activity: z.enum(["active", "inactive"]).optional(), tags: z.array(z.string()).default([]),
  tagMode: z.enum(["any", "all"]).default("any"), lastActionType: z.string().optional(),
  nextActionType: z.string().optional(), lastScriptCode: z.string().optional(),
  followUpFrom: z.string().optional(), followUpTo: z.string().optional(),
  followUpState: z.enum(["overdue", "today", "upcoming", "none"]).optional(),
  sortBy: z.enum(["name", "customerId", "status", "orderCount", "lastOrderDate", "lastAction", "followUpDate"]).default("name"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(10),
});

export type CustomerTableQuery = z.input<typeof querySchema>;
export type CustomerTableItem = ReturnType<typeof buildItem>;

function numberParam(params: Record<string, string>, key: string, fallback: number) {
  const parsed = Number(params[key]); return Number.isFinite(parsed) ? parsed : fallback;
}
function isVisibleInCustomerTable(customer: WorkspaceDataset["customers"][number]) {
  return customer.optIn !== "Não" && customer.eatzMarketingOptIn !== false;
}
function effectiveMetrics(customer: WorkspaceDataset["customers"][number], orders: WorkspaceDataset["orders"]) {
  const completed = orders.filter((order) => order.customerId === customer.id && order.status === "concluído");
  if (completed.length) {
    const sorted = [...completed].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    const ltv = completed.reduce((total, order) => total + order.amount, 0);
    return { orderCount: completed.length, ltv, avgTicket: ltv / completed.length, lastOrderDate: sorted.at(-1)?.orderDate ?? null, source: "crm_orders" as const };
  }
  return { orderCount: customer.eatzOrderCount ?? 0, ltv: customer.eatzTotalSpent ?? 0,
    avgTicket: customer.eatzAvgTicket ?? 0, lastOrderDate: customer.eatzLastOrderDate,
    source: customer.eatzOrderCount != null ? "eatz_snapshot" as const : "none" as const };
}
function latest(actions: ActionRow[], status: ActionRow["status"], field: "completedAt" | "scheduledFor") {
  return actions.filter((action) => action.status === status && action[field])
    .sort((a, b) => (status === "completed" ? -1 : 1) * (a[field]!.localeCompare(b[field]!)))[0] ?? null;
}
function buildItem(dataset: WorkspaceDataset, customer: WorkspaceDataset["customers"][number], today: string) {
  const metrics = effectiveMetrics(customer, dataset.orders);
  const thresholds: CustomerStatusThresholds = {
    vipMinOrders: numberParam(dataset.parameters, "vip_min_orders", 4),
    vipMinLtv: numberParam(dataset.parameters, "vip_min_ltv", 100),
    noOrderInactiveDays: numberParam(dataset.parameters, "crm_new_no_order_days", 21),
    oneOrderInactiveDays: numberParam(dataset.parameters, "crm_new_one_order_days", 30),
    repeatInactiveDays: numberParam(dataset.parameters, "crm_inactive_repeat_days", 60),
  };
  const status = calculateCustomerStatus({ ...metrics, registeredAt: customer.eatzRegisteredAt ?? customer.registeredAt,
    manuallyInactive: customer.inactive, today, thresholds });
  const actions = dataset.actions.filter((action) => action.customerId === customer.id);
  const lastAction = latest(actions, "completed", "completedAt");
  // A data de follow-up é sempre a data da próxima ação explicitamente criada.
  // Recomendações automáticas do motor legado não entram neste read model.
  const nextAction = latest(actions, "pending", "scheduledFor");
  const contacts = dataset.contacts.filter((contact) => contact.customerId === customer.id && contact.direction === "Enviado" && contact.scriptCode)
    .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt));
  const script = contacts[0];
  const tagMap = new Map(dataset.tags.map((tag) => [tag.name, tag]));
  const tags = dataset.assignments.filter((row) => row.customerId === customer.id).map((row) => tagMap.get(row.tagName)).filter(Boolean);
  return {
    id: customer.id, firstName: customer.firstName, lastName: customer.lastName,
    fullName: [customer.firstName, customer.lastName].filter(Boolean).join(" "), phone: customer.phone,
    status, orderCount: metrics.orderCount, ltv: metrics.ltv, avgTicket: metrics.avgTicket,
    lastOrderDate: metrics.lastOrderDate, metricsSource: metrics.source,
    lastAction: lastAction ? { id: lastAction.id, typeCode: lastAction.actionTypeCode, typeName: lastAction.actionTypeName, completedAt: lastAction.completedAt, notes: lastAction.notes } : null,
    nextAction: nextAction ? { id: nextAction.id, typeCode: nextAction.actionTypeCode, typeName: nextAction.actionTypeName, scheduledFor: nextAction.scheduledFor, notes: nextAction.notes, scriptCode: nextAction.scriptCode, source: "manual" as const } : null,
    followUpDate: nextAction?.scheduledFor ?? null, tags,
    lastScript: script ? { code: script.scriptCode!, name: dataset.scripts.find((item) => item.code === script.scriptCode)?.name ?? script.scriptCode!, sentAt: script.contactedAt } : null,
  };
}

export class CrmWorkspaceService {
  constructor(private readonly repository: CrmWorkspaceRepositoryPort) {}

  async listCustomers(organizationId: OrganizationId, raw: CustomerTableQuery, now = new Date()) {
    const query = querySchema.parse(raw); const dataset = await this.repository.loadDataset(organizationId);
    const today = now.toISOString().slice(0, 10); const search = query.search?.trim().toLocaleLowerCase("pt-PT");
    let items = dataset.customers.filter(isVisibleInCustomerTable)
      .map((customer) => buildItem(dataset, customer, today)).filter((item) => {
      if (search && !`${item.id} ${item.fullName} ${item.phone ?? ""}`.toLocaleLowerCase("pt-PT").includes(search)) return false;
      if (query.status && item.status.relationship !== query.status) return false;
      if (query.activity && item.status.inactive !== (query.activity === "inactive")) return false;
      if (query.tags.length) { const names = new Set(item.tags.map((tag) => tag!.name)); const matches = query.tags.map((tag) => names.has(tag)); if (query.tagMode === "all" ? matches.some((v) => !v) : matches.every((v) => !v)) return false; }
      if (query.lastActionType && item.lastAction?.typeCode !== query.lastActionType) return false;
      if (query.nextActionType && item.nextAction?.typeCode !== query.nextActionType) return false;
      if (query.lastScriptCode && item.lastScript?.code !== query.lastScriptCode) return false;
      const follow = item.followUpDate?.slice(0, 10) ?? null;
      if (query.followUpFrom && (!follow || follow < query.followUpFrom)) return false;
      if (query.followUpTo && (!follow || follow > query.followUpTo)) return false;
      if (query.followUpState === "none" && follow) return false;
      if (query.followUpState === "today" && follow !== today) return false;
      if (query.followUpState === "overdue" && (!follow || follow >= today)) return false;
      if (query.followUpState === "upcoming" && (!follow || follow <= today)) return false;
      return true;
    });
    const value = (item: typeof items[number]) => ({ name: item.fullName, customerId: item.id, status: item.status.relationship,
      orderCount: item.orderCount, lastOrderDate: item.lastOrderDate ?? "", lastAction: item.lastAction?.completedAt ?? "",
      followUpDate: item.followUpDate ?? "" })[query.sortBy];
    items.sort((a, b) => {
      const aValue = value(a); const bValue = value(b);
      if (aValue === "" && bValue !== "") return 1;
      if (bValue === "" && aValue !== "") return -1;
      return String(aValue).localeCompare(String(bValue), "pt-PT", { numeric: true }) * (query.sortDirection === "asc" ? 1 : -1);
    });
    const total = items.length; const start = (query.page - 1) * query.pageSize;
    return { items: items.slice(start, start + query.pageSize), total, page: query.page, pageSize: query.pageSize };
  }

  listTags = async (organizationId: OrganizationId) => (await this.repository.loadDataset(organizationId)).tags;
  listActionTypes = (organizationId: OrganizationId) => this.repository.listActionTypes(organizationId);
  createActionType(organizationId: OrganizationId, input: { code?: string | undefined; name: string; color: string; active: boolean }) {
    const code = input.code ?? input.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "");
    if (!code) throw new Error("Nome do tipo de ação inválido");
    return this.repository.createActionType(organizationId, { ...input, code });
  }
  updateActionType(organizationId: OrganizationId, code: string, input: { name: string; color?: string | undefined }) {
    return this.repository.updateActionType(organizationId, code, { ...input, name: input.name.trim() });
  }
  createActions = (organizationId: OrganizationId, input: Parameters<CrmWorkspaceRepositoryPort["createActions"]>[1]) => this.repository.createActions(organizationId, input);
  completeAction(organizationId: OrganizationId, id: string, completedAt: string) { return this.repository.completeAction(organizationId, id, completedAt); }
  completeActions(organizationId: OrganizationId, actions: { id: string; completedAt: string }[]) { return this.repository.completeActions(organizationId, actions); }
  async listCustomerActions(organizationId: OrganizationId, customerId: string, cursor: string | undefined, limit: number) {
    const offset = cursor ? Number(cursor) : 0;
    if (!Number.isInteger(offset) || offset < 0) throw new Error("Cursor de histórico inválido");
    const result = await this.repository.listCustomerActions(organizationId, customerId, limit, offset);
    const nextOffset = offset + result.history.length;
    return { ...result, nextCursor: nextOffset < result.total ? String(nextOffset) : null };
  }
  createTag(organizationId: OrganizationId, input: { label: string; color?: string | undefined; category?: string | undefined }) {
    const name = input.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!name) throw new Error("Nome da tag inválido");
    return this.repository.createTag(organizationId, { name, label: input.label.trim(), color: input.color ?? "#6b7280", category: input.category ?? "geral" });
  }
  updateTags(organizationId: OrganizationId, customerIds: string[], add: string[], remove: string[]) { return this.repository.updateTags(organizationId, customerIds, add, remove); }
  setInactive(organizationId: OrganizationId, customerIds: string[], inactive: boolean) { return this.repository.setInactive(organizationId, customerIds, inactive); }
}
