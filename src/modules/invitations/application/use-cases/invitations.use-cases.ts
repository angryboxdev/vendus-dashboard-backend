import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvitationError, invitationState, validateInvitation, validateJoin, type JoinRequest } from "../../domain/entities/invitation.js";
import type { InvitationCodesPort, InvitationLookupPort, InvitationsContextPort, InvitationsRepositoryPort } from "../../domain/ports/out/invitations.ports.js";

export interface Actor {
  email: string;
}

const MIN_REASON = 5;
const DAY = 86_400_000;
/** Mensagem igual para código inexistente, expirado, esgotado ou revogado (sem enumeração). */
const INVALID = "Este convite não é válido ou já expirou. Peça um novo à empresa.";

export class InvitationsUseCases {
  constructor(
    private readonly repo: InvitationsRepositoryPort,
    private readonly codes: InvitationCodesPort,
    private readonly lookup: InvitationLookupPort,
    private readonly ctx: InvitationsContextPort,
  ) {}

  /** Convites com o estado calculado e o código só mascarado. */
  async list(org: OrganizationId) {
    const now = this.ctx.now();
    return (await this.repo.list(org)).map((i) => ({ ...i, state: invitationState(i, now), maskedCode: `••••••${i.codeHint}` }));
  }

  /** Cria e devolve o código completo uma única vez (fica auditado, sem o código). */
  async create(org: OrganizationId, actor: Actor, input: { locationId: string | null; departmentId: string | null; expiresInDays: number; maxUses: number | null }) {
    validateInvitation(input);
    const code = this.codes.generate();
    const expiresAt = new Date(Date.parse(this.ctx.now()) + input.expiresInDays * DAY).toISOString();
    const inv = await this.repo.create(org, { codeHash: this.codes.hash(code), codeHint: code.slice(-4), locationId: input.locationId, departmentId: input.departmentId, maxUses: input.maxUses, expiresAt }, actor.email);
    await this.ctx.audit(org, { actor: actor.email, action: "invitations.create", resourceId: inv.id, after: { locationId: inv.locationId, departmentId: inv.departmentId, maxUses: inv.maxUses, expiresAt } });
    return { invitation: { ...inv, state: invitationState(inv, this.ctx.now()), maskedCode: `••••••${inv.codeHint}` }, code };
  }

  /** Revogar tem efeito imediato; os pedidos pendentes mantêm-se. */
  async revoke(org: OrganizationId, actor: Actor, id: string) {
    const inv = await this.repo.get(org, id);
    if (!inv) throw new InvitationError("Convite não encontrado.", "not_found");
    if (inv.status === "revoked") return;
    await this.repo.revoke(org, id, this.ctx.now());
    await this.ctx.audit(org, { actor: actor.email, action: "invitations.revoke", resourceId: id, after: { status: "revoked" } });
  }

  /** Pedidos com a etiqueta do convite (ex.: revogado) e o aviso de possível duplicado. */
  async requests(org: OrganizationId) {
    const now = this.ctx.now();
    const invitations = new Map((await this.repo.list(org)).map((i) => [i.id, i]));
    return (await this.repo.listRequests(org)).map((r) => {
      const inv = invitations.get(r.invitationId);
      return { ...r, invitationState: inv ? invitationState(inv, now) : ("revoked" as const), locationId: inv?.locationId ?? null, departmentId: inv?.departmentId ?? null };
    });
  }

  // ── Público (sem sessão) ─────────────────────────────────────────────

  private async resolve(code: string) {
    const clean = (code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6,32}$/.test(clean)) throw new InvitationError(INVALID, "invalid_invitation");
    const hit = await this.lookup.findByCodeHash(this.codes.hash(clean));
    if (!hit) throw new InvitationError(INVALID, "invalid_invitation");
    const inv = await this.repo.get(hit.organizationId, hit.invitationId);
    if (!inv || invitationState(inv, this.ctx.now()) !== "active") throw new InvitationError(INVALID, "invalid_invitation");
    return { org: hit.organizationId, inv };
  }

  /** O código é válido? (para o formulário público; não revela a organização). */
  async check(code: string) {
    const { inv } = await this.resolve(code);
    return { valid: true, expiresAt: inv.expiresAt };
  }

  /** Pedido de adesão: só nome, apelidos e e-mail. */
  async submit(code: string, input: { firstName: string; lastName: string; email: string }) {
    const data = validateJoin(input);
    const { org, inv } = await this.resolve(code);
    if (!(await this.repo.consumeUse(org, inv.id))) throw new InvitationError(INVALID, "invalid_invitation");
    const possibleDuplicate = !!(await this.ctx.employeeByEmail(org, data.email));
    const r = await this.repo.createRequest(org, { invitationId: inv.id, ...data, possibleDuplicate });
    await this.ctx.audit(org, { actor: "convite", action: "invitations.join_request", resourceId: r.id, after: { invitationId: inv.id, possibleDuplicate } });
    return { received: true };
  }

  // ── Decidir ──────────────────────────────────────────────────────────

  private async pending(org: OrganizationId, id: string): Promise<JoinRequest> {
    const r = await this.repo.getRequest(org, id);
    if (!r) throw new InvitationError("Pedido não encontrado.", "not_found");
    if (r.status !== "pending") throw new InvitationError("Este pedido já foi tratado.", "conflict");
    return r;
  }

  /** Aceitar devolve os dados para pré-preencher a criação da pessoa; só fica aceite ao concluir. */
  async prefill(org: OrganizationId, id: string) {
    const r = await this.pending(org, id);
    const inv = await this.repo.get(org, r.invitationId);
    return { requestId: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email, locationId: inv?.locationId ?? null, departmentId: inv?.departmentId ?? null, existingEmployeeId: r.possibleDuplicate ? await this.ctx.employeeByEmail(org, r.email) : null };
  }

  /** A pessoa foi criada no assistente: o pedido passa a aceite e fica ligado à ficha. */
  async complete(org: OrganizationId, actor: Actor, id: string, employeeId: string) {
    await this.pending(org, id);
    if (!employeeId) throw new InvitationError("Indique a ficha criada.", "validation", "employeeId");
    const ok = await this.repo.decide(org, id, "pending", { status: "accepted", employeeId, decidedBy: actor.email, decidedAt: this.ctx.now() });
    if (!ok) throw new InvitationError("Este pedido já foi tratado.", "conflict");
    await this.ctx.audit(org, { actor: actor.email, action: "invitations.accept", resourceId: id, after: { employeeId } });
  }

  /** Recusar: motivo interno obrigatório (o requerente não o vê). */
  async reject(org: OrganizationId, actor: Actor, id: string, reason: string) {
    await this.pending(org, id);
    const why = (reason ?? "").trim();
    if (why.length < MIN_REASON) throw new InvitationError(`Indique o motivo (mínimo ${MIN_REASON} caracteres).`, "validation", "reason");
    const ok = await this.repo.decide(org, id, "pending", { status: "rejected", rejectReason: why, decidedBy: actor.email, decidedAt: this.ctx.now() });
    if (!ok) throw new InvitationError("Este pedido já foi tratado.", "conflict");
    await this.ctx.audit(org, { actor: actor.email, action: "invitations.reject", resourceId: id, after: { status: "rejected" }, reason: why });
  }
}
