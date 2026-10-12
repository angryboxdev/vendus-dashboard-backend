import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { DistributionError, isPending, proofCsv, recipientStatus, validateAudience, validateNew, type Audience, type Distribution } from "../../domain/entities/distribution.js";
import type { DistributionFilesPort, DistributionsContextPort, DistributionsRepositoryPort } from "../../domain/ports/out/distributions.ports.js";

export interface Actor {
  userId: string;
  email: string;
}

const LINK = "/hr/novo/documentos";

export class DistributionsUseCases {
  constructor(
    private readonly repo: DistributionsRepositoryPort,
    private readonly files: DistributionFilesPort,
    private readonly ctx: DistributionsContextPort,
  ) {}

  private async getOr404(org: OrganizationId, id: string) {
    const d = await this.repo.get(org, id);
    if (!d) throw new DistributionError("Envio não encontrado.", "not_found");
    return d;
  }

  /** Lista com o progresso de cada envio (destinatários, abertos, confirmados). */
  async list(org: OrganizationId) {
    const items = await this.repo.list(org);
    const rows = await this.repo.listAllRecipients(
      org,
      items.map((d) => d.id),
    );
    return items.map((d) => {
      const mine = rows.filter((r) => r.distributionId === d.id);
      return { ...d, stats: { recipients: mine.length, read: mine.filter((r) => r.readAt).length, confirmed: mine.filter((r) => r.confirmedAt).length } };
    });
  }

  /** Quantas pessoas o público abrange agora (passo 2 do assistente). */
  async previewAudience(org: OrganizationId, audience: Audience | undefined) {
    validateAudience(audience);
    const people = await this.ctx.resolveAudience(org, audience);
    return { recipients: people.length, withoutAccount: people.filter((p) => !p.userId).length };
  }

  /** Guarda o ficheiro uma vez, congela os destinatários e avisa quem tem conta. */
  async send(org: OrganizationId, actor: Actor, input: { title: string; audience: Audience | undefined; requiresConfirmation: boolean; file: { buffer: Buffer; name: string; mimeType: string; size: number } | null }) {
    validateNew(input);
    const audience = input.audience as Audience;
    const file = input.file!;
    const people = await this.ctx.resolveAudience(org, audience);
    if (!people.length) throw new DistributionError("O público escolhido não tem colaboradores ativos.", "validation", "audience");
    const storagePath = await this.files.store(org, file.buffer, file.name, file.mimeType);
    const d = await this.repo.create(org, { title: input.title.trim(), fileName: file.name, mimeType: file.mimeType, sizeBytes: file.size, audience, requiresConfirmation: input.requiresConfirmation, createdBy: actor.email, storagePath });
    await this.repo.insertRecipients(org, d.id, people);
    await this.ctx.notify(
      org,
      people.map((p) => p.userId).filter((u): u is string => !!u),
      { title: `Documento: ${d.title}`, body: d.requiresConfirmation ? "Abra o documento e confirme a leitura." : "Tem um documento novo.", link: LINK, dedupeKey: `distribution:${d.id}` },
    );
    await this.ctx.audit(org, { actor: actor.email, action: "documents.distribute", resourceId: d.id, after: { title: d.title, fileName: d.fileName, recipients: people.length, requiresConfirmation: d.requiresConfirmation } });
    return { ...d, stats: { recipients: people.length, read: 0, confirmed: 0 }, withoutAccount: people.filter((p) => !p.userId).length };
  }

  async report(org: OrganizationId, id: string) {
    const { storagePath: _p, ...d } = await this.getOr404(org, id);
    const names = await this.ctx.employeeNames(org);
    const rows = (await this.repo.listRecipients(org, id))
      .map((r) => ({ employeeId: r.employeeId, name: names.get(r.employeeId) ?? "", deliveredAt: r.deliveredAt, readAt: r.readAt, confirmedAt: r.confirmedAt, status: recipientStatus(r), hasAccount: !!r.userId }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));
    return { distribution: d, totals: { recipients: rows.length, read: rows.filter((r) => r.readAt).length, confirmed: rows.filter((r) => r.confirmedAt).length }, rows };
  }

  /** Lembra quem ainda não abriu (ou não confirmou, se pedido). No máximo um lembrete por dia. */
  async remind(org: OrganizationId, actor: Actor, id: string) {
    const d = await this.getOr404(org, id);
    if (d.status !== "sent") throw new DistributionError("Só envios ativos.", "invalid_state");
    const pending = (await this.repo.listRecipients(org, id)).filter((r) => isPending(d, r));
    const users = pending.map((r) => r.userId).filter((u): u is string => !!u);
    const day = this.ctx.now().slice(0, 10);
    await this.ctx.notify(org, users, { title: `Lembrete: ${d.title}`, body: d.requiresConfirmation ? "Ainda falta confirmar a leitura deste documento." : "Ainda não abriu este documento.", link: LINK, dedupeKey: `distribution:${id}:remind:${day}` });
    await this.ctx.audit(org, { actor: actor.email, action: "documents.distribution_remind", resourceId: id, after: { pending: pending.length, notified: users.length } });
    return { pending: pending.length, notified: users.length, withoutAccount: pending.length - users.length };
  }

  /** Arquivar: deixa de aparecer ao colaborador; a prova mantém-se. */
  async archive(org: OrganizationId, actor: Actor, id: string) {
    const d = await this.getOr404(org, id);
    if (d.status === "archived") return;
    await this.repo.setStatus(org, id, "archived");
    await this.ctx.audit(org, { actor: actor.email, action: "documents.distribution_archive", resourceId: id, after: { status: "archived" } });
  }

  async proof(org: OrganizationId, id: string) {
    const r = await this.report(org, id);
    const safe = r.distribution.title.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
    return { fileName: `prova-documento-${safe}.csv`, content: proofCsv(r.rows) };
  }

  /** Gestão: descarregar o ficheiro enviado. */
  async downloadUrl(org: OrganizationId, id: string) {
    const d = await this.getOr404(org, id);
    return { url: await this.files.signedUrl(org, d.storagePath, d.fileName) };
  }

  // ── Colaborador ──────────────────────────────────────────────────────
  private async me(org: OrganizationId, actor: Actor) {
    const employeeId = await this.ctx.employeeForUser(org, actor.userId);
    if (!employeeId) throw new DistributionError("Sem ficha de colaborador associada.", "not_found");
    return employeeId;
  }

  /** Documentos enviados ao colaborador (envios ativos), mais recentes primeiro. */
  async mine(org: OrganizationId, actor: Actor) {
    const employeeId = await this.me(org, actor);
    const rows = await this.repo.recipientRows(org, employeeId);
    const out: (Distribution & { readAt: string | null; confirmedAt: string | null })[] = [];
    for (const r of rows) {
      const d = await this.repo.get(org, r.distributionId);
      if (!d || d.status !== "sent") continue;
      const { storagePath: _p, ...rest } = d;
      out.push({ ...rest, readAt: r.readAt, confirmedAt: r.confirmedAt });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async myRow(org: OrganizationId, actor: Actor, id: string) {
    const employeeId = await this.me(org, actor);
    const d = await this.repo.get(org, id);
    const row = d && d.status === "sent" ? (await this.repo.recipientRows(org, employeeId)).find((r) => r.distributionId === id) : undefined;
    // Quem não é destinatário recebe 404 (não revela que o envio existe).
    if (!d || !row) throw new DistributionError("Documento não encontrado.", "not_found");
    return { d, employeeId };
  }

  /** Abrir o documento conta como "aberto" (a primeira vez fica registada). */
  async myDownloadUrl(org: OrganizationId, actor: Actor, id: string) {
    const { d, employeeId } = await this.myRow(org, actor, id);
    await this.repo.mark(org, id, employeeId, { readAt: this.ctx.now() });
    return { url: await this.files.signedUrl(org, d.storagePath, d.fileName) };
  }

  async confirm(org: OrganizationId, actor: Actor, id: string) {
    const { d, employeeId } = await this.myRow(org, actor, id);
    if (!d.requiresConfirmation) throw new DistributionError("Este documento não pede confirmação.", "confirmation_not_required");
    const now = this.ctx.now();
    const r = await this.repo.mark(org, id, employeeId, { readAt: now, confirmedAt: now });
    await this.ctx.audit(org, { actor: actor.email, action: "documents.distribution_confirm", resourceId: id, after: { employeeId } });
    return r;
  }
}
