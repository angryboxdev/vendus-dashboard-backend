import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { AnnouncementsUseCases } from "../application/use-cases/announcements.use-cases.js";
import type { Announcement, Audience, Receipt } from "../domain/entities/announcement.js";
import type { AnnouncementsContextPort, AnnouncementsRepositoryPort } from "../domain/ports/out/announcements.ports.js";

const ORG = mintOrganizationId("org-a");
const ADMIN = { userId: "u-admin", email: "admin@demo.invalid" };
const ANA = { userId: "u-e1", email: "ana@demo.invalid" };

class FakeRepo implements AnnouncementsRepositoryPort {
  items: Announcement[] = [];
  versions: { announcementId: string; version: number; title: string; body: string; createdBy: string; createdAt: string }[] = [];
  recipients: { announcementId: string; employeeId: string; userId: string | null }[] = [];
  receipts: Receipt[] = [];
  async list() {
    return this.items.map((a) => ({ ...a }));
  }
  async get(_o: OrganizationId, id: string) {
    const a = this.items.find((x) => x.id === id);
    return a ? { ...a } : null;
  }
  async create(_o: OrganizationId, a: Pick<Announcement, "audience" | "requiresConfirmation" | "title" | "body">) {
    const row: Announcement = { ...a, id: `a${this.items.length + 1}`, status: "draft", currentVersion: 1, publishedAt: null, publishedBy: null, createdAt: "2026-10-12T09:00:00Z" };
    this.items.push(row);
    return { ...row };
  }
  async update(_o: OrganizationId, id: string, patch: Partial<Announcement>) {
    const a = this.items.find((x) => x.id === id)!;
    Object.assign(a, patch);
    return { ...a };
  }
  async insertVersion(_o: OrganizationId, v: { announcementId: string; version: number; title: string; body: string }, by: string) {
    this.versions.push({ ...v, createdBy: by, createdAt: "2026-10-12T10:00:00Z" });
  }
  async listVersions(_o: OrganizationId, id: string) {
    return this.versions.filter((v) => v.announcementId === id);
  }
  async insertRecipients(_o: OrganizationId, announcementId: string, r: { employeeId: string; userId: string | null }[]) {
    this.recipients.push(...r.map((x) => ({ ...x, announcementId })));
  }
  async listRecipients(_o: OrganizationId, id: string) {
    return this.recipients.filter((r) => r.announcementId === id);
  }
  async recipientAnnouncements(_o: OrganizationId, employeeId: string) {
    return this.recipients.filter((r) => r.employeeId === employeeId).map((r) => r.announcementId);
  }
  async insertReceipts(_o: OrganizationId, announcementId: string, version: number, employeeIds: string[]) {
    this.receipts.push(...employeeIds.map((employeeId) => ({ announcementId, version, employeeId, deliveredAt: "2026-10-12T10:00:00Z", readAt: null, confirmedAt: null })));
  }
  async listReceipts(_o: OrganizationId, id: string) {
    return this.receipts.filter((r) => r.announcementId === id).map((r) => ({ ...r }));
  }
  async markReceipt(_o: OrganizationId, id: string, version: number, employeeId: string, patch: { readAt?: string; confirmedAt?: string }) {
    const r = this.receipts.find((x) => x.announcementId === id && x.version === version && x.employeeId === employeeId);
    if (!r) return null;
    if (patch.readAt && !r.readAt) r.readAt = patch.readAt;
    if (patch.confirmedAt) r.confirmedAt = patch.confirmedAt;
    return { ...r };
  }
}

class FakeCtx implements AnnouncementsContextPort {
  sent: { userIds: string[]; title: string }[] = [];
  people = [
    { employeeId: "e1", userId: "u-e1", location: "porto" },
    { employeeId: "e2", userId: null, location: "lisboa" },
  ];
  async resolveAudience(_o: OrganizationId, a: Audience) {
    const all = this.people;
    if (a.type === "all") return all.map(({ employeeId, userId }) => ({ employeeId, userId }));
    if (a.type === "employees") return all.filter((p) => a.ids.includes(p.employeeId)).map(({ employeeId, userId }) => ({ employeeId, userId }));
    return all.filter((p) => a.ids.includes(p.location)).map(({ employeeId, userId }) => ({ employeeId, userId }));
  }
  async employeeForUser(_o: OrganizationId, userId: string) {
    return this.people.find((p) => p.userId === userId)?.employeeId ?? null;
  }
  async notify(_o: OrganizationId, userIds: string[], n: { title: string }) {
    this.sent.push({ userIds, title: n.title });
  }
  now() {
    return "2026-10-12T11:00:00Z";
  }
  async audit() {}
}

function setup() {
  const repo = new FakeRepo();
  const ctx = new FakeCtx();
  return { repo, ctx, uc: new AnnouncementsUseCases(repo, ctx) };
}

describe("Comunicados", () => {
  test("RE_31_destinatarios_imutaveis_depois_de_publicar", async () => {
    const { uc, repo, ctx } = setup();
    const a = await uc.create(ORG, ADMIN, { title: "Novo horário de verão", body: "…", audience: { type: "locations", ids: ["porto"] }, requiresConfirmation: true });
    // Em rascunho o público pode mudar.
    await uc.update(ORG, ADMIN, a.id, { audience: { type: "all" } });
    await uc.publish(ORG, ADMIN, a.id);
    expect(repo.recipients.map((r) => r.employeeId)).toEqual(["e1", "e2"]);
    expect(ctx.sent.at(-1)).toEqual({ userIds: ["u-e1"], title: "Comunicado: Novo horário de verão" });
    await expect(uc.update(ORG, ADMIN, a.id, { audience: { type: "employees", ids: ["e1"] } })).rejects.toMatchObject({ code: "audience_frozen" });
    // Mesmo que entrem pessoas novas na organização, a lista não muda.
    ctx.people.push({ employeeId: "e3", userId: "u-e3", location: "porto" });
    expect((await repo.listRecipients(ORG, a.id)).length).toBe(2);
    await expect(uc.publish(ORG, ADMIN, a.id)).rejects.toMatchObject({ code: "invalid_state" });
  });

  test("RE_32_relatorio_entregue_lido_confirmado_com_data_e_versao", async () => {
    const { uc } = setup();
    const a = await uc.create(ORG, ADMIN, { title: "Regras de fardamento", body: "v1", audience: { type: "all" }, requiresConfirmation: true });
    await uc.publish(ORG, ADMIN, a.id);
    await uc.markRead(ORG, ANA, a.id);
    await uc.confirm(ORG, ANA, a.id);
    let r = await uc.report(ORG, a.id);
    expect(r.totals).toEqual({ recipients: 2, read: 1, confirmed: 1 });
    expect(r.rows.find((x) => x.employeeId === "e1")).toMatchObject({ version: 1, status: "confirmed", readAt: "2026-10-12T11:00:00Z", confirmedAt: "2026-10-12T11:00:00Z" });
    expect(r.rows.find((x) => x.employeeId === "e2")).toMatchObject({ version: 1, status: "delivered", readAt: null });
    // Texto novo = versão 2; a confirmação é por versão.
    await uc.update(ORG, ADMIN, a.id, { body: "v2" });
    r = await uc.report(ORG, a.id);
    expect(r.announcement.currentVersion).toBe(2);
    expect(r.totals).toEqual({ recipients: 2, read: 0, confirmed: 0 });
    expect(r.versions.map((v) => v.version)).toEqual([1, 2]);
    expect((await uc.mine(ORG, ANA))[0]).toMatchObject({ version: 2, body: "v2", confirmedAt: null });
  });

  test("validações: título obrigatório; confirmar só se pedido; público vazio não publica", async () => {
    const { uc, ctx } = setup();
    await expect(uc.create(ORG, ADMIN, { title: " ", body: "", audience: { type: "all" }, requiresConfirmation: false })).rejects.toMatchObject({ field: "title" });
    const a = await uc.create(ORG, ADMIN, { title: "Info", body: "x", audience: { type: "employees", ids: ["ninguem"] }, requiresConfirmation: false });
    await expect(uc.publish(ORG, ADMIN, a.id)).rejects.toMatchObject({ field: "audience" });
    await uc.update(ORG, ADMIN, a.id, { audience: { type: "employees", ids: ["e1"] } });
    await uc.publish(ORG, ADMIN, a.id);
    await expect(uc.confirm(ORG, ANA, a.id)).rejects.toMatchObject({ code: "confirmation_not_required" });
    expect(ctx.sent).toHaveLength(1);
  });
});
