import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { WorkspaceUseCases } from "../application/use-cases/workspace.use-cases.js";
import type { CustomRequest, OpsTask, Presence, RequestForm, RequestFormInput } from "../domain/entities/workspace.js";
import type { WorkspaceContextPort, WorkspaceRepositoryPort } from "../domain/ports/out/workspace.ports.js";

const ORG = mintOrganizationId("org-a");
const BOSS = { userId: "u-boss", email: "gestora@demo.invalid" };
const ANA = { userId: "u-e1", email: "ana@demo.invalid" };

class FakeRepo implements WorkspaceRepositoryPort {
  tasks: OpsTask[] = [];
  forms: RequestForm[] = [];
  requests: CustomRequest[] = [];
  async listTasks(_o: OrganizationId, f: { status?: OpsTask["status"]; assigneeEmployeeId?: string }) {
    return this.tasks.filter((t) => (!f.status || t.status === f.status) && (!f.assigneeEmployeeId || t.assigneeEmployeeId === f.assigneeEmployeeId));
  }
  async getTask(_o: OrganizationId, id: string) {
    const t = this.tasks.find((x) => x.id === id);
    return t ? structuredClone(t) : null;
  }
  async createTask(_o: OrganizationId, t: Omit<OpsTask, "id" | "status" | "completedBy" | "completedAt" | "createdAt">) {
    const row: OpsTask = { ...t, id: `t${this.tasks.length + 1}`, status: "open", completedBy: null, completedAt: null, createdAt: "x" };
    this.tasks.push(row);
    return structuredClone(row);
  }
  async updateTask(_o: OrganizationId, id: string, expected: OpsTask["status"], patch: Partial<OpsTask>) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.status !== expected) return null;
    Object.assign(t, structuredClone(patch));
    return structuredClone(t);
  }
  async listForms() {
    return this.forms;
  }
  async createForm(_o: OrganizationId, f: RequestFormInput) {
    const row = { ...f, id: `f${this.forms.length + 1}`, archived: false };
    this.forms.push(row);
    return row;
  }
  async archiveForm(_o: OrganizationId, id: string) {
    this.forms.find((f) => f.id === id)!.archived = true;
  }
  async listRequests(_o: OrganizationId, f: { status?: CustomRequest["status"]; employeeId?: string }) {
    return this.requests.filter((r) => (!f.status || r.status === f.status) && (!f.employeeId || r.employeeId === f.employeeId));
  }
  async getRequest(_o: OrganizationId, id: string) {
    return this.requests.find((r) => r.id === id) ?? null;
  }
  async createRequest(_o: OrganizationId, r: Omit<CustomRequest, "id" | "status" | "decidedBy" | "decidedAt" | "decisionComment" | "createdAt">) {
    const row: CustomRequest = { ...r, id: `q${this.requests.length + 1}`, status: "pending", decidedBy: null, decidedAt: null, decisionComment: null, createdAt: "x" };
    this.requests.push(row);
    return row;
  }
  async decideRequest(_o: OrganizationId, id: string, d: { status: "approved" | "rejected"; decidedBy: string; comment: string | null }) {
    const r = this.requests.find((x) => x.id === id);
    if (!r || r.status !== "pending") return null;
    Object.assign(r, { status: d.status, decidedBy: d.decidedBy, decisionComment: d.comment, decidedAt: "x" });
    return r;
  }
}

class FakeCtx implements WorkspaceContextPort {
  users = new Map([["u-e1", "e1"], ["u-e2", "e2"], ["u-boss", "e9"]]);
  locations = new Map([["e1", ["porto"]], ["e2", ["lisboa"]], ["e9", ["porto"]]]);
  scope: "own_location" | "organization" = "own_location";
  present: Presence[] = [
    { employeeId: "e9", name: "Gestora", state: "work", since: "2026-10-12T08:00:00Z", locationIds: ["porto"] },
    { employeeId: "e2", name: "Bruno", state: "remote", since: "2026-10-12T08:30:00Z", locationIds: ["lisboa"] },
  ];
  async employeeForUser(_o: OrganizationId, userId: string) {
    return this.users.get(userId) ?? null;
  }
  async employeeLocations(_o: OrganizationId, employeeId: string) {
    return this.locations.get(employeeId) ?? [];
  }
  async presentNow() {
    return this.present;
  }
  async whosInScope() {
    return this.scope;
  }
  now() {
    return "2026-10-12T10:00:00.000Z";
  }
  async notify() {}
  async userOfEmployee(_o: OrganizationId, employeeId: string) {
    return [...this.users.entries()].find(([, e]) => e === employeeId)?.[0] ?? null;
  }
  async audit() {}
}

function setup() {
  const repo = new FakeRepo();
  const ctx = new FakeCtx();
  return { repo, ctx, uc: new WorkspaceUseCases(repo, ctx) };
}

describe("Quem está (CF-15)", () => {
  test("CF_15_com_so_o_proprio_centro_nao_ve_colegas_de_outros_centros", async () => {
    const { uc, ctx } = setup();
    const own = await uc.whosIn(ORG, ANA);
    expect(own.people.map((p) => p.employeeId)).toEqual(["e9"]);
    expect(own.people[0]).toEqual({ employeeId: "e9", name: "Gestora", state: "work", since: "2026-10-12T08:00:00Z" });
    ctx.scope = "organization";
    expect((await uc.whosIn(ORG, ANA)).people.map((p) => p.employeeId)).toEqual(["e9", "e2"]);
  });
});

describe("Tarefas operacionais", () => {
  test("checklist: só conclui com os obrigatórios feitos; só a pessoa ou a gestão mexem", async () => {
    const { uc } = setup();
    const t = await uc.createTask(ORG, BOSS, { title: "Abertura da loja", description: null, assigneeEmployeeId: "e1", locationId: "porto", dueAt: "2026-10-12T12:00:00.000Z", checklist: [{ text: "Ligar fornos", required: true }, { text: "Foto da montra", required: false }] });
    await expect(uc.completeTask(ORG, ANA, t.id, false)).rejects.toThrow("Falta concluir: Ligar fornos");
    await expect(uc.toggleItem(ORG, { userId: "u-e2", email: "b" }, t.id, t.checklist[0]!.id, true, false)).rejects.toMatchObject({ code: "forbidden" });
    const toggled = await uc.toggleItem(ORG, ANA, t.id, t.checklist[0]!.id, true, false);
    expect(toggled.checklist[0]).toMatchObject({ done: true, doneBy: "ana@demo.invalid" });
    expect((await uc.completeTask(ORG, ANA, t.id, false)).status).toBe("done");
    await expect(uc.toggleItem(ORG, ANA, t.id, t.checklist[1]!.id, true, false)).rejects.toMatchObject({ code: "invalid_state" });
    expect((await uc.myTasks(ORG, ANA)).map((x) => x.id)).toEqual([t.id]);
  });
});

describe("Solicitações personalizadas (C6.3)", () => {
  const FORM: RequestFormInput = {
    title: "Pedido de fardamento",
    responseDays: 5,
    fields: [
      { id: "size", title: "Tamanho", type: "single", options: ["S", "M", "L"], required: true },
      { id: "items", title: "Peças", type: "multiple", options: ["Camisa", "Avental"], required: false },
      { id: "notes", title: "Notas", type: "text", options: [], required: false },
    ],
  };

  test("título obrigatório; respostas validadas; o próprio não decide; recusar exige motivo", async () => {
    const { uc } = setup();
    await expect(uc.createForm(ORG, BOSS, { ...FORM, title: "" })).rejects.toMatchObject({ message: "O título é obrigatório" });
    await expect(uc.createForm(ORG, BOSS, { ...FORM, fields: Array.from({ length: 51 }, (_, i) => ({ id: `f${i}`, title: "x", type: "text" as const, options: [], required: false })) })).rejects.toMatchObject({ field: "fields" });
    const f = await uc.createForm(ORG, BOSS, FORM);
    await expect(uc.submit(ORG, ANA, f.id, { items: ["Camisa"] })).rejects.toMatchObject({ field: "size" });
    await expect(uc.submit(ORG, ANA, f.id, { size: "XL" })).rejects.toMatchObject({ field: "size" });
    const r = await uc.submit(ORG, ANA, f.id, { size: "M", items: ["Camisa", "Camisa"], notes: "  urgente " });
    expect(r).toMatchObject({ answers: { size: "M", items: ["Camisa"], notes: "urgente" }, dueAt: "2026-10-17T10:00:00.000Z" });
    await expect(uc.decide(ORG, ANA, r.id, "approve", null)).rejects.toMatchObject({ code: "forbidden" });
    await expect(uc.decide(ORG, BOSS, r.id, "reject", null)).rejects.toMatchObject({ field: "comment" });
    expect((await uc.decide(ORG, BOSS, r.id, "approve", null)).status).toBe("approved");
    await expect(uc.decide(ORG, BOSS, r.id, "approve", null)).rejects.toMatchObject({ code: "invalid_state" });
  });
});
