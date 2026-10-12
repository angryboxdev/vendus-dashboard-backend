import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { AnnouncementError, receiptStatus, validateDraft, type Audience } from "../../domain/entities/announcement.js";
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
