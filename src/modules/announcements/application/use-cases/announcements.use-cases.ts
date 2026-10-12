import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { AnnouncementError, proofCsv, receiptStatus, validateDraft, type Audience } from "../../domain/entities/announcement.js";
import type { AnnouncementsContextPort, AnnouncementsRepositoryPort } from "../../domain/ports/out/announcements.ports.js";

export interface Actor {
  userId: string;
  email: string;
}

export class AnnouncementsUseCases {
  constructor(
    private readonly repo: AnnouncementsRepositoryPort,
    private readonly ctx: AnnouncementsContextPort,
  ) {}

  private async one(org: OrganizationId, id: string) {
    const a = await this.repo.get(org, id);
    if (!a) throw new AnnouncementError("Comunicado não encontrado.", "not_found");
    return a;
  }

  list(org: OrganizationId) {
    return this.repo.list(org);
  }

  /** Lista com leituras e confirmações da versão atual (FE-060). */
  async listWithStats(org: OrganizationId) {
    const list = await this.repo.list(org);
    return Promise.all(
      list.map(async (a) => {
        if (a.status === "draft") return { ...a, stats: null };
        const current = (await this.repo.listReceipts(org, a.id)).filter((r) => r.version === a.currentVersion);
        return { ...a, stats: { recipients: current.length, read: current.filter((r) => r.readAt).length, confirmed: current.filter((r) => r.confirmedAt).length } };
      }),
    );
  }

  /** Quantas pessoas o público escolhido abrange agora (FE-061), sem gravar nada. */
  async previewAudience(org: OrganizationId, audience: Audience) {
    validateDraft({ title: "x", body: "", audience });
    const r = await this.ctx.resolveAudience(org, audience);
    return { recipients: r.length, withoutAccount: r.filter((x) => !x.userId).length };
  }

  /** Duplicar: novo rascunho com o mesmo texto e público (FE-060). */
  async duplicate(org: OrganizationId, actor: Actor, id: string) {
    const cur = await this.one(org, id);
    return this.create(org, actor, { title: `Cópia de ${cur.title}`.slice(0, 160), body: cur.body, audience: cur.audience, requiresConfirmation: cur.requiresConfirmation });
  }

  /** Eliminar só rascunhos; publicados arquivam-se (a prova de leitura fica). */
  async deleteDraft(org: OrganizationId, actor: Actor, id: string) {
    const cur = await this.one(org, id);
    if (cur.status !== "draft") throw new AnnouncementError("Só se elimina um rascunho. Os publicados arquivam-se.", "invalid_state");
    await this.repo.deleteDraft(org, id);
    await this.ctx.audit(org, { actor: actor.email, action: "announcements.delete_draft", resourceId: id, after: null });
  }

  /** Lembrete a quem ainda não leu (ou não confirmou, se pede confirmação) — no máximo um por dia (FE-062). */
  async remind(org: OrganizationId, actor: Actor, id: string) {
    const a = await this.one(org, id);
    if (a.status !== "published") throw new AnnouncementError("Só se lembra um comunicado publicado.", "invalid_state");
    const receipts = (await this.repo.listReceipts(org, id)).filter((r) => r.version === a.currentVersion && (a.requiresConfirmation ? !r.confirmedAt : !r.readAt));
    const pending = new Set(receipts.map((r) => r.employeeId));
    const users = (await this.repo.listRecipients(org, id)).filter((r) => pending.has(r.employeeId)).map((r) => r.userId).filter((u): u is string => !!u);
    const day = this.ctx.now().slice(0, 10);
    await this.ctx.notify(org, users, { title: `Lembrete: ${a.title}`, body: a.requiresConfirmation ? "Ainda falta confirmar a leitura." : "Ainda não leu este comunicado.", link: "/hr/novo/comunicados", dedupeKey: `announcement:${id}:${a.currentVersion}:remind:${day}` });
    await this.ctx.audit(org, { actor: actor.email, action: "announcements.remind", resourceId: id, after: { pending: pending.size, notified: users.length } });
    return { pending: pending.size, notified: users.length, withoutAccount: pending.size - users.length };
  }

  /** Prova de leitura em CSV (versão atual), para guardar ou enviar (FE-062). */
  async proof(org: OrganizationId, id: string) {
    const a = await this.one(org, id);
    const [receipts, names] = await Promise.all([this.repo.listReceipts(org, id), this.ctx.employeeNames(org)]);
    const rows = receipts
      .filter((r) => r.version === a.currentVersion)
      .map((r) => ({ name: names.get(r.employeeId) ?? r.employeeId, version: r.version, deliveredAt: r.deliveredAt, readAt: r.readAt, confirmedAt: r.confirmedAt }))
      .sort((x, y) => x.name.localeCompare(y.name, "pt"));
    return { fileName: `prova-leitura-${a.title.replace(/[^\w-]+/g, "_").slice(0, 40)}-v${a.currentVersion}.csv`, content: proofCsv(rows) };
  }

  async create(org: OrganizationId, actor: Actor, input: { title: string; body: string; audience: Audience; requiresConfirmation: boolean }) {
    validateDraft(input);
    const a = await this.repo.create(org, { title: input.title.trim(), body: input.body, audience: input.audience, requiresConfirmation: input.requiresConfirmation }, actor.email);
    await this.ctx.audit(org, { actor: actor.email, action: "announcements.create", resourceId: a.id, after: a });
    return a;
  }

  /**
   * Editar: em rascunho muda tudo; publicado, o público não muda (RE-31) e o
   * texto novo é uma versão nova, entregue de novo aos mesmos destinatários.
   */
  async update(org: OrganizationId, actor: Actor, id: string, input: { title?: string; body?: string; audience?: Audience; requiresConfirmation?: boolean }) {
    const cur = await this.one(org, id);
    if (cur.status === "archived") throw new AnnouncementError("Comunicado arquivado.", "invalid_state");
    if (cur.status === "published" && input.audience !== undefined && JSON.stringify(input.audience) !== JSON.stringify(cur.audience)) {
      throw new AnnouncementError("Os destinatários não mudam depois de publicar. Crie um comunicado novo.", "audience_frozen", "audience");
    }
    const next = { title: input.title ?? cur.title, body: input.body ?? cur.body, audience: input.audience ?? cur.audience };
    validateDraft(next);
    if (cur.status === "draft") {
      return this.repo.update(org, id, { title: next.title.trim(), body: next.body, audience: next.audience, requiresConfirmation: input.requiresConfirmation ?? cur.requiresConfirmation });
    }
    if (next.title.trim() === cur.title && next.body === cur.body) return cur;
    const version = cur.currentVersion + 1;
    await this.repo.insertVersion(org, { announcementId: id, version, title: next.title.trim(), body: next.body }, actor.email);
    const updated = await this.repo.update(org, id, { title: next.title.trim(), body: next.body, currentVersion: version });
    const recipients = await this.repo.listRecipients(org, id);
    await this.repo.insertReceipts(org, id, version, recipients.map((r) => r.employeeId));
    await this.ctx.notify(org, recipients.map((r) => r.userId).filter((u): u is string => !!u), { title: `Comunicado atualizado: ${updated.title}`, body: "Há uma versão nova deste comunicado.", link: "/hr/novo/comunicados", dedupeKey: `announcement:${id}:${version}` });
    await this.ctx.audit(org, { actor: actor.email, action: "announcements.new_version", resourceId: id, after: { version } });
    return updated;
  }

  /** Publicar: resolve e congela os destinatários; entrega a versão 1. */
  async publish(org: OrganizationId, actor: Actor, id: string) {
    const cur = await this.one(org, id);
    if (cur.status !== "draft") throw new AnnouncementError("Só se publica um rascunho.", "invalid_state");
    const recipients = await this.ctx.resolveAudience(org, cur.audience);
    if (!recipients.length) throw new AnnouncementError("O público escolhido não tem colaboradores.", "validation", "audience");
    await this.repo.insertVersion(org, { announcementId: id, version: 1, title: cur.title, body: cur.body }, actor.email);
    await this.repo.insertRecipients(org, id, recipients);
    await this.repo.insertReceipts(org, id, 1, recipients.map((r) => r.employeeId));
    const updated = await this.repo.update(org, id, { status: "published", currentVersion: 1, publishedAt: this.ctx.now(), publishedBy: actor.email });
    await this.ctx.notify(org, recipients.map((r) => r.userId).filter((u): u is string => !!u), { title: `Comunicado: ${cur.title}`, body: cur.requiresConfirmation ? "Leia e confirme a leitura." : "Tem um comunicado novo.", link: "/hr/novo/comunicados", dedupeKey: `announcement:${id}:1` });
    await this.ctx.audit(org, { actor: actor.email, action: "announcements.publish", resourceId: id, after: { recipients: recipients.length } });
    return updated;
  }

  async archive(org: OrganizationId, actor: Actor, id: string) {
    await this.one(org, id);
    const a = await this.repo.update(org, id, { status: "archived" });
    await this.ctx.audit(org, { actor: actor.email, action: "announcements.archive", resourceId: id, after: null });
    return a;
  }

  /** RE-32: por destinatário, estado da versão atual (entregue/lido/confirmado) com datas; e o histórico de versões. */
  async report(org: OrganizationId, id: string) {
    const a = await this.one(org, id);
    const [receipts, versions] = await Promise.all([this.repo.listReceipts(org, id), this.repo.listVersions(org, id)]);
    const current = receipts.filter((r) => r.version === a.currentVersion);
    return {
      announcement: a,
      versions,
      totals: {
        recipients: current.length,
        read: current.filter((r) => r.readAt).length,
        confirmed: current.filter((r) => r.confirmedAt).length,
      },
      rows: receipts.map((r) => ({ ...r, status: receiptStatus(r) })).sort((x, y) => x.employeeId.localeCompare(y.employeeId) || y.version - x.version),
    };
  }

  // ── Colaborador ─────────────────────────────────────────────────────
  private async me(org: OrganizationId, actor: Actor) {
    const e = await this.ctx.employeeForUser(org, actor.userId);
    if (!e) throw new AnnouncementError("Esta conta não está ligada a uma ficha de colaborador.", "not_found");
    return e;
  }

  async mine(org: OrganizationId, actor: Actor) {
    const employeeId = await this.me(org, actor);
    const ids = await this.repo.recipientAnnouncements(org, employeeId);
    const out = [];
    for (const id of ids) {
      const a = await this.repo.get(org, id);
      if (!a || a.status !== "published") continue;
      const r = (await this.repo.listReceipts(org, id)).find((x) => x.employeeId === employeeId && x.version === a.currentVersion);
      out.push({ id: a.id, title: a.title, body: a.body, version: a.currentVersion, publishedAt: a.publishedAt, requiresConfirmation: a.requiresConfirmation, readAt: r?.readAt ?? null, confirmedAt: r?.confirmedAt ?? null });
    }
    return out.sort((x, y) => (y.publishedAt ?? "").localeCompare(x.publishedAt ?? ""));
  }

  async markRead(org: OrganizationId, actor: Actor, id: string) {
    const employeeId = await this.me(org, actor);
    const a = await this.one(org, id);
    const r = await this.repo.markReceipt(org, id, a.currentVersion, employeeId, { readAt: this.ctx.now() });
    if (!r) throw new AnnouncementError("Comunicado não encontrado.", "not_found");
    return r;
  }

  async confirm(org: OrganizationId, actor: Actor, id: string) {
    const employeeId = await this.me(org, actor);
    const a = await this.one(org, id);
    if (!a.requiresConfirmation) throw new AnnouncementError("Este comunicado não pede confirmação.", "confirmation_not_required");
    const now = this.ctx.now();
    const r = await this.repo.markReceipt(org, id, a.currentVersion, employeeId, { readAt: now, confirmedAt: now });
    if (!r) throw new AnnouncementError("Comunicado não encontrado.", "not_found");
    return r;
  }
}
