import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { AlertsUseCases } from "../application/use-cases/alerts.use-cases.js";
import { qualifies, type Alert, type AlertKind, type AlertRule, type AlertRuleInput, type Candidate } from "../domain/entities/alert.js";
import type { AlertsContextPort, AlertsRepositoryPort } from "../domain/ports/out/alerts.ports.js";

const ORG = mintOrganizationId("org-a");
const RH = { userId: "u-rh", email: "rh@demo.invalid" };

class FakeRepo implements AlertsRepositoryPort {
  rules: AlertRule[] = [];
  alerts: Alert[] = [];
  async listRules() {
    return this.rules.map((r) => ({ ...r }));
  }
  async createRule(_o: OrganizationId, r: AlertRuleInput) {
    const row = { ...r, id: `r${this.rules.length + 1}` };
    this.rules.push(row);
    return row;
  }
  async updateRule(_o: OrganizationId, id: string, r: AlertRuleInput) {
    const i = this.rules.findIndex((x) => x.id === id);
    this.rules[i] = { ...r, id };
    return this.rules[i]!;
  }
  async listAlerts(_o: OrganizationId, f: { status?: Alert["status"] | "active" }) {
    return this.alerts.filter((a) => !f.status || (f.status === "active" ? a.status !== "closed" : a.status === f.status)).map((a) => ({ ...a }));
  }
  async getAlert(_o: OrganizationId, id: string) {
    const a = this.alerts.find((x) => x.id === id);
    return a ? { ...a } : null;
  }
  async openAlert(_o: OrganizationId, a: Pick<Alert, "ruleId" | "sourceType" | "sourceId" | "employeeId" | "title" | "ownerUserIds" | "dueAt">) {
    if (this.alerts.some((x) => x.status !== "closed" && x.ruleId === a.ruleId && x.sourceType === a.sourceType && x.sourceId === a.sourceId)) return null;
    const row: Alert = { ...a, id: `al${this.alerts.length + 1}`, status: "open", escalatedAt: null, escalatedTo: null, takenBy: null, closedBy: null, closedAt: null, closeNote: null, createdAt: "x" };
    this.alerts.push(row);
    return { ...row };
  }
  async updateAlert(_o: OrganizationId, id: string, expected: Alert["status"][], patch: Partial<Alert>) {
    const a = this.alerts.find((x) => x.id === id);
    if (!a || !expected.includes(a.status)) return null;
    Object.assign(a, patch);
    return { ...a };
  }
}

class FakeCtx implements AlertsContextPort {
  nowValue = "2026-10-12T09:00:00.000Z";
  sources = new Map<AlertKind, Candidate[]>();
  sent: { userIds: string[]; title: string }[] = [];
  async candidates(_o: OrganizationId, kind: AlertKind) {
    return this.sources.get(kind) ?? [];
  }
  async resolveOwner(_o: OrganizationId, owner: string) {
    return owner === "admins" ? ["u-admin"] : owner.startsWith("user:") ? [owner.slice(5)] : ["u-rh"];
  }
  async notify(_o: OrganizationId, userIds: string[], n: { title: string }) {
    this.sent.push({ userIds, title: n.title });
  }
  now() {
    return this.nowValue;
  }
  async audit() {}
}

function setup() {
  const repo = new FakeRepo();
  const ctx = new FakeCtx();
  return { repo, ctx, uc: new AlertsUseCases(repo, ctx) };
}

const pendingAbsence = (id: string, since: string): Candidate => ({ sourceType: "absence_request", sourceId: id, employeeId: "e1", title: "Ausência pendente da Ana", mode: "since", at: since });

describe("Alertas", () => {
  test("domínio: pendente há N dias / a acontecer dentro de N dias", () => {
    expect(qualifies(pendingAbsence("a", "2026-10-09T09:00:00.000Z"), 3, "2026-10-12T09:00:00.000Z")).toBe(true);
    expect(qualifies(pendingAbsence("a", "2026-10-10T09:00:00.000Z"), 3, "2026-10-12T09:00:00.000Z")).toBe(false);
    const contract: Candidate = { sourceType: "contract", sourceId: "c", employeeId: "e1", title: "Contrato a terminar", mode: "until", at: "2026-11-01" };
    expect(qualifies(contract, 30, "2026-10-12T09:00:00.000Z")).toBe(true);
    expect(qualifies(contract, 10, "2026-10-12T09:00:00.000Z")).toBe(false);
  });

  test("RE_24_pedido_pendente_ha_mais_de_N_dias_gera_alerta_e_escala_quando_o_prazo_passa", async () => {
    const { uc, ctx, repo } = setup();
    await uc.createRule(ORG, RH, { kind: "pending_absence", thresholdDays: 3, owner: "user:u-boss", slaHours: 24, escalateTo: "admins", enabled: true });
    ctx.sources.set("pending_absence", [pendingAbsence("abs-1", "2026-10-08T09:00:00.000Z"), pendingAbsence("abs-2", "2026-10-11T09:00:00.000Z")]);
    expect(await uc.evaluate(ORG)).toEqual({ opened: 1, closed: 0, escalated: 0 });
    expect(repo.alerts[0]).toMatchObject({ sourceId: "abs-1", ownerUserIds: ["u-boss"], status: "open", dueAt: "2026-10-13T09:00:00.000Z" });
    expect(ctx.sent.at(-1)).toEqual({ userIds: ["u-boss"], title: "Alerta: Ausência pendente da Ana" });
    // Sem duplicados.
    expect((await uc.evaluate(ORG)).opened).toBe(0);
    // Passa o prazo → escala aos administradores.
    ctx.nowValue = "2026-10-13T10:00:00.000Z";
    expect((await uc.evaluate(ORG)).escalated).toBe(1);
    expect(repo.alerts[0]).toMatchObject({ escalatedTo: ["u-admin"], ownerUserIds: ["u-boss", "u-admin"] });
    expect(ctx.sent.some((s) => s.title.startsWith("Alerta escalado"))).toBe(true);
  });

  test("RE_36_ciclo_completo_origem_dono_estado_fecho", async () => {
    const { uc, ctx, repo } = setup();
    await uc.createRule(ORG, RH, { kind: "pending_correction", thresholdDays: 0, owner: "admins", slaHours: 48, escalateTo: null, enabled: true });
    ctx.sources.set("pending_correction", [{ sourceType: "correction_request", sourceId: "cr-1", employeeId: "e1", title: "Pedido de correção", mode: "since", at: "2026-10-12T08:00:00.000Z" }]);
    const [a] = await uc.list(ORG, "active");
    expect(a).toMatchObject({ sourceType: "correction_request", sourceId: "cr-1", ownerUserIds: ["u-admin"], status: "open" });
    expect((await uc.take(ORG, RH, a!.id)).status).toBe("in_progress");
    await expect(uc.close(ORG, RH, a!.id, "")).rejects.toMatchObject({ field: "note" });
    const closed = await uc.close(ORG, RH, a!.id, "Pedido aprovado por telefone");
    expect(closed).toMatchObject({ status: "closed", closedBy: "rh@demo.invalid", closeNote: "Pedido aprovado por telefone" });
    await expect(uc.close(ORG, RH, a!.id, "x")).rejects.toMatchObject({ code: "invalid_state" });
    // Fecho automático: a origem deixou de estar pendente.
    ctx.sources.set("pending_correction", [{ sourceType: "correction_request", sourceId: "cr-2", employeeId: "e1", title: "Outro", mode: "since", at: "2026-10-12T08:00:00.000Z" }]);
    await uc.evaluate(ORG);
    ctx.sources.set("pending_correction", []);
    expect((await uc.evaluate(ORG)).closed).toBe(1);
    expect(repo.alerts.find((x) => x.sourceId === "cr-2")).toMatchObject({ status: "closed", closedBy: "sistema" });
  });

  test("regras validadas; desligadas não geram alertas", async () => {
    const { uc, ctx } = setup();
    await expect(uc.createRule(ORG, RH, { kind: "pending_absence", thresholdDays: 3, owner: "qualquer", slaHours: 24, escalateTo: null, enabled: true })).rejects.toMatchObject({ field: "owner" });
    await uc.createRule(ORG, RH, { kind: "pending_absence", thresholdDays: 0, owner: "admins", slaHours: 24, escalateTo: null, enabled: false });
    ctx.sources.set("pending_absence", [pendingAbsence("x", "2026-10-01T00:00:00.000Z")]);
    expect((await uc.evaluate(ORG)).opened).toBe(0);
  });
});
