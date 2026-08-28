import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CrmWorkspaceService } from "../../application/crm-workspace.service.js";
import type {
  ActionRow,
  CrmWorkspaceRepositoryPort,
  CustomerRow,
  WorkspaceDataset,
} from "../../domain/ports/out/crm-workspace-repository.port.js";

const orgId = mintOrganizationId("org-test");

const baseCustomer = (overrides: Partial<CustomerRow> = {}): CustomerRow => ({
  id: "C001",
  firstName: "Ana",
  lastName: "Silva",
  phone: "+351900000001",
  email: null,
  preferredChannel: "WhatsApp",
  birthday: null,
  howFound: null,
  optIn: "Pendente",
  notes: null,
  referredBy: null,
  seg07Path: null,
  inactive: false,
  registeredAt: "2026-08-01",
  eatzRegisteredAt: "2026-08-01",
  eatzLastOrderDate: null,
  eatzOrderCount: null,
  eatzTotalSpent: null,
  eatzAvgTicket: null,
  eatzSegment: null,
  eatzMarketingOptIn: null,
  eatzSnapshotAt: null,
  manualFollowupDate: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...overrides,
});

const action = (overrides: Partial<ActionRow> = {}): ActionRow => ({
  id: "action-1",
  customerId: "C001",
  actionTypeCode: "call",
  actionTypeName: "Telefonar",
  actionTypeColor: "#64748b",
  status: "pending",
  scheduledFor: "2026-08-25T10:00:00.000Z",
  completedAt: null,
  notes: null,
  scriptCode: null,
  createdAt: "2026-08-20T10:00:00.000Z",
  ...overrides,
});

const dataset = (overrides: Partial<WorkspaceDataset> = {}): WorkspaceDataset => ({
  customers: [baseCustomer()],
  orders: [],
  contacts: [],
  actions: [],
  tags: [],
  assignments: [],
  scripts: [],
  parameters: {},
  ...overrides,
});

function fakeRepository(seed: WorkspaceDataset): jest.Mocked<CrmWorkspaceRepositoryPort> {
  return {
    loadDataset: jest.fn().mockResolvedValue(seed),
    listActionTypes: jest.fn().mockResolvedValue([]),
    createActionType: jest.fn(async (_organizationId, input) => ({ ...input, system: false })),
    updateActionType: jest.fn(async (_organizationId, code, input) => ({ code, color: input.color ?? "#64748b", active: true, system: false, name: input.name })),
    createActions: jest.fn().mockResolvedValue([]),
    completeAction: jest.fn(async (_organizationId, id, completedAt) => action({ id, status: "completed", completedAt })),
    completeActions: jest.fn().mockResolvedValue([]),
    listCustomerActions: jest.fn().mockResolvedValue({ pending: null, history: [], total: 0 }),
    createTag: jest.fn(async (_organizationId, input) => ({ ...input, active: true })),
    updateTags: jest.fn().mockResolvedValue(undefined),
    setInactive: jest.fn().mockResolvedValue(undefined),
  };
}

describe("CrmWorkspaceService.listCustomers", () => {
  it("usa paginação de 10 clientes por padrão e mantém o total completo", async () => {
    const customers = Array.from({ length: 12 }, (_, index) =>
      baseCustomer({ id: `C${String(index + 1).padStart(3, "0")}`, firstName: `Cliente ${String(index + 1).padStart(2, "0")}` }),
    );
    const service = new CrmWorkspaceService(fakeRepository(dataset({ customers })));

    const result = await service.listCustomers(orgId, {}, new Date("2026-08-22T12:00:00.000Z"));

    expect(result).toMatchObject({ total: 12, page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(10);
  });

  it("oculta clientes com recusa explícita de marketing no CRM ou na eatz", async () => {
    const customers = [
      baseCustomer({ id: "C001", optIn: "Pendente", eatzMarketingOptIn: null }),
      baseCustomer({ id: "C002", optIn: "Sim", eatzMarketingOptIn: true }),
      baseCustomer({ id: "C003", optIn: "Não", eatzMarketingOptIn: true }),
      baseCustomer({ id: "C004", optIn: "Pendente", eatzMarketingOptIn: false }),
      baseCustomer({ id: "C005", optIn: "Sim", eatzMarketingOptIn: false }),
    ];
    const service = new CrmWorkspaceService(fakeRepository(dataset({ customers })));

    const result = await service.listCustomers(
      orgId,
      { sortBy: "customerId" },
      new Date("2026-08-22T12:00:00.000Z"),
    );

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id)).toEqual(["C001", "C002"]);
  });

  it("usa o snapshot eatz quando não existem pedidos concluídos no CRM", async () => {
    const customer = baseCustomer({
      eatzOrderCount: 3,
      eatzTotalSpent: 75,
      eatzAvgTicket: 25,
      eatzLastOrderDate: "2026-08-15",
    });
    const service = new CrmWorkspaceService(fakeRepository(dataset({ customers: [customer] })));

    const { items } = await service.listCustomers(orgId, {}, new Date("2026-08-22T12:00:00.000Z"));

    expect(items[0]).toMatchObject({
      orderCount: 3,
      ltv: 75,
      avgTicket: 25,
      lastOrderDate: "2026-08-15",
      metricsSource: "eatz_snapshot",
    });
  });

  it("prefere pedidos concluídos do CRM e ignora pedidos cancelados", async () => {
    const service = new CrmWorkspaceService(fakeRepository(dataset({
      customers: [baseCustomer({ eatzOrderCount: 8, eatzTotalSpent: 800, eatzAvgTicket: 100, eatzLastOrderDate: "2026-08-20" })],
      orders: [
        { id: "O1", customerId: "C001", orderDate: "2026-08-10", amount: 20, status: "concluído", notes: null, createdAt: "2026-08-10" },
        { id: "O2", customerId: "C001", orderDate: "2026-08-12", amount: 30, status: "concluído", notes: null, createdAt: "2026-08-12" },
        { id: "O3", customerId: "C001", orderDate: "2026-08-21", amount: 500, status: "cancelado", notes: null, createdAt: "2026-08-21" },
      ],
    })));

    const { items } = await service.listCustomers(orgId, {}, new Date("2026-08-22T12:00:00.000Z"));

    expect(items[0]).toMatchObject({ orderCount: 2, ltv: 50, avgTicket: 25, lastOrderDate: "2026-08-12", metricsSource: "crm_orders" });
  });

  it("resolve a última ação, a próxima ação e o último script sem usar o follow-up legado", async () => {
    const service = new CrmWorkspaceService(fakeRepository(dataset({
      customers: [baseCustomer({ manualFollowupDate: "2026-09-30" })],
      actions: [
        action({ id: "pending-late", scheduledFor: "2026-08-28T10:00:00.000Z" }),
        action({ id: "pending-next", scheduledFor: "2026-08-24T10:00:00.000Z" }),
        action({ id: "completed-old", status: "completed", scheduledFor: "2026-08-10T10:00:00.000Z", completedAt: "2026-08-11T10:00:00.000Z" }),
        action({ id: "completed-last", status: "completed", scheduledFor: "2026-08-12T10:00:00.000Z", completedAt: "2026-08-13T10:00:00.000Z" }),
      ],
      contacts: [
        { id: "ct1", customerId: "C001", contactedAt: "2026-08-19T10:00:00.000Z", channel: "WhatsApp", scriptCode: "S1", direction: "Enviado", status: null, response: null, notes: null, segmentAtTime: null, tagsAdded: [], tagsRemoved: [], createdAt: "2026-08-19" },
        { id: "ct2", customerId: "C001", contactedAt: "2026-08-20T10:00:00.000Z", channel: "WhatsApp", scriptCode: "S2", direction: "Recebido", status: null, response: null, notes: null, segmentAtTime: null, tagsAdded: [], tagsRemoved: [], createdAt: "2026-08-20" },
      ],
      scripts: [{ code: "S1", name: "Boas-vindas" }],
    })));

    const { items } = await service.listCustomers(orgId, {}, new Date("2026-08-22T12:00:00.000Z"));

    expect(items[0]?.lastAction?.id).toBe("completed-last");
    expect(items[0]?.nextAction?.id).toBe("pending-next");
    expect(items[0]?.followUpDate).toBe("2026-08-24T10:00:00.000Z");
    expect(items[0]?.lastScript).toEqual({ code: "S1", name: "Boas-vindas", sentAt: "2026-08-19T10:00:00.000Z" });
  });

  it("filtra tags nos modos any e all", async () => {
    const seed = dataset({
      customers: [baseCustomer({ id: "C001" }), baseCustomer({ id: "C002", firstName: "Bia" })],
      tags: [
        { name: "vip-local", label: "VIP local", color: "#111111", category: "geral", active: true },
        { name: "feedback", label: "Feedback", color: "#222222", category: "geral", active: true },
      ],
      assignments: [
        { customerId: "C001", tagName: "vip-local" },
        { customerId: "C001", tagName: "feedback" },
        { customerId: "C002", tagName: "feedback" },
      ],
    });
    const service = new CrmWorkspaceService(fakeRepository(seed));

    const any = await service.listCustomers(orgId, { tags: ["vip-local", "feedback"], tagMode: "any" });
    const all = await service.listCustomers(orgId, { tags: ["vip-local", "feedback"], tagMode: "all" });

    expect(any.items.map((item) => item.id)).toEqual(["C001", "C002"]);
    expect(all.items.map((item) => item.id)).toEqual(["C001"]);
  });

  it("filtra pelo último script enviado, e não por qualquer script histórico", async () => {
    const customers = [baseCustomer({ id: "C001" }), baseCustomer({ id: "C002", firstName: "Bia" })];
    const contacts = [
      { id: "ct1", customerId: "C001", contactedAt: "2026-08-18T10:00:00.000Z", channel: "WhatsApp" as const, scriptCode: "S1", direction: "Enviado" as const, status: null, response: null, notes: null, segmentAtTime: null, tagsAdded: [], tagsRemoved: [], createdAt: "2026-08-18" },
      { id: "ct2", customerId: "C001", contactedAt: "2026-08-20T10:00:00.000Z", channel: "WhatsApp" as const, scriptCode: "S2", direction: "Enviado" as const, status: null, response: null, notes: null, segmentAtTime: null, tagsAdded: [], tagsRemoved: [], createdAt: "2026-08-20" },
      { id: "ct3", customerId: "C002", contactedAt: "2026-08-19T10:00:00.000Z", channel: "Email" as const, scriptCode: "S1", direction: "Enviado" as const, status: null, response: null, notes: null, segmentAtTime: null, tagsAdded: [], tagsRemoved: [], createdAt: "2026-08-19" },
    ];
    const service = new CrmWorkspaceService(fakeRepository(dataset({ customers, contacts })));

    const result = await service.listCustomers(orgId, { lastScriptCode: "S1" });

    expect(result.items.map((item) => item.id)).toEqual(["C002"]);
  });

  it("filtra follow-ups vencidos, de hoje, futuros e ausentes", async () => {
    const customers = ["C001", "C002", "C003", "C004"].map((id) => baseCustomer({ id, firstName: id }));
    const actions = [
      action({ id: "a1", customerId: "C001", scheduledFor: "2026-08-21T10:00:00.000Z" }),
      action({ id: "a2", customerId: "C002", scheduledFor: "2026-08-22T10:00:00.000Z" }),
      action({ id: "a3", customerId: "C003", scheduledFor: "2026-08-23T10:00:00.000Z" }),
    ];
    const service = new CrmWorkspaceService(fakeRepository(dataset({ customers, actions })));
    const now = new Date("2026-08-22T12:00:00.000Z");

    await expect(service.listCustomers(orgId, { followUpState: "overdue" }, now)).resolves.toMatchObject({ items: [{ id: "C001" }] });
    await expect(service.listCustomers(orgId, { followUpState: "today" }, now)).resolves.toMatchObject({ items: [{ id: "C002" }] });
    await expect(service.listCustomers(orgId, { followUpState: "upcoming" }, now)).resolves.toMatchObject({ items: [{ id: "C003" }] });
    await expect(service.listCustomers(orgId, { followUpState: "none" }, now)).resolves.toMatchObject({ items: [{ id: "C004" }] });
  });

  it("ordena códigos de cliente numericamente", async () => {
    const customers = ["C010", "C002", "C001"].map((id) => baseCustomer({ id, firstName: id }));
    const service = new CrmWorkspaceService(fakeRepository(dataset({ customers })));

    const asc = await service.listCustomers(orgId, { sortBy: "customerId", sortDirection: "asc" });
    const desc = await service.listCustomers(orgId, { sortBy: "customerId", sortDirection: "desc" });

    expect(asc.items.map((item) => item.id)).toEqual(["C001", "C002", "C010"]);
    expect(desc.items.map((item) => item.id)).toEqual(["C010", "C002", "C001"]);
  });

  it("rejeita paginação inválida antes de consultar o repositório", async () => {
    const repository = fakeRepository(dataset());
    const service = new CrmWorkspaceService(repository);

    await expect(service.listCustomers(orgId, { pageSize: 101 })).rejects.toThrow();
    expect(repository.loadDataset).not.toHaveBeenCalled();
  });
});

describe("CrmWorkspaceService commands", () => {
  it("gera código estável para um novo tipo de ação", async () => {
    const repository = fakeRepository(dataset());
    const service = new CrmWorkspaceService(repository);

    await service.createActionType(orgId, { name: "  Reunião Pós-venda  ", color: "#123456", active: true });

    expect(repository.createActionType).toHaveBeenCalledWith(orgId, { code: "reuniao_pos_venda", name: "  Reunião Pós-venda  ", color: "#123456", active: true });
  });

  it("rejeita nomes que não produzem código de tipo ou tag", () => {
    const service = new CrmWorkspaceService(fakeRepository(dataset()));

    expect(() => service.createActionType(orgId, { name: "!!!", color: "#123456", active: true })).toThrow("Nome do tipo de ação inválido");
    expect(() => service.createTag(orgId, { label: "---" })).toThrow("Nome da tag inválido");
  });

  it("normaliza tag e aplica cor e categoria padrão", async () => {
    const repository = fakeRepository(dataset());
    const service = new CrmWorkspaceService(repository);

    await service.createTag(orgId, { label: "  Cliente Próximo  " });

    expect(repository.createTag).toHaveBeenCalledWith(orgId, { name: "cliente-proximo", label: "Cliente Próximo", color: "#6b7280", category: "geral" });
  });

  it("calcula o próximo cursor a partir do offset e do tamanho da página", async () => {
    const repository = fakeRepository(dataset());
    repository.listCustomerActions.mockResolvedValue({
      pending: null,
      history: [action({ id: "h1", status: "completed" }), action({ id: "h2", status: "completed" })],
      total: 5,
    });
    const service = new CrmWorkspaceService(repository);

    const result = await service.listCustomerActions(orgId, "C001", "2", 2);

    expect(repository.listCustomerActions).toHaveBeenCalledWith(orgId, "C001", 2, 2);
    expect(result.nextCursor).toBe("4");
  });

  it("remove o cursor quando chega ao fim e rejeita cursores inválidos", async () => {
    const repository = fakeRepository(dataset());
    repository.listCustomerActions.mockResolvedValue({ pending: null, history: [action({ status: "completed" })], total: 1 });
    const service = new CrmWorkspaceService(repository);

    await expect(service.listCustomerActions(orgId, "C001", undefined, 20)).resolves.toMatchObject({ nextCursor: null });
    await expect(service.listCustomerActions(orgId, "C001", "-1", 20)).rejects.toThrow("Cursor de histórico inválido");
    await expect(service.listCustomerActions(orgId, "C001", "abc", 20)).rejects.toThrow("Cursor de histórico inválido");
  });
});
