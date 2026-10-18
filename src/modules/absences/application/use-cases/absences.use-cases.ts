import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { rulesFor, validateType, type AbsenceType, type AbsenceTypeInput, type LeaveRules } from "../../domain/entities/absence-type.js";
import { snapshotLevels, validateFlow, type ApprovalFlow, type ApprovalFlowInput } from "../../domain/entities/approval-flow.js";
import { overlaps, type AbsenceRequest, type RequestStatus } from "../../domain/entities/request.js";
import { AbsenceConflictError, AbsenceForbiddenError, AbsenceNotFoundError, AbsenceRuleError, AbsenceValidationError } from "../../domain/errors.js";
import type { AbsenceAttachmentStoragePort, AbsencesAuditPort, AbsencesClockPort, AbsencesContextPort, AbsencesNotifierPort, AbsencesRepositoryPort, PeriodGuardPort } from "../../domain/ports/out/absences.ports.js";
import { attachmentFolder, ownsAttachment, safeFileName, validateAttachmentFile, type AbsenceAttachment } from "../../domain/services/attachment.service.js";
import { randomUUID } from "node:crypto";
import { absenceEffect, accrualFor, periodStart, requestAmount, summarize, type DayEffect, type PlanDay } from "../../domain/services/absence-calc.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Tipo «Folga» do Portal (ticket 05). */
const DAY_OFF_CODE = "FOLGA";
/** Valores seguros de um tipo novo (ADR-0028): pede aprovação, sem limite, sem valores legais. */
const SAFE_TYPE: AbsenceTypeInput = {
  name: "",
  code: null,
  color: null,
  category: "permission",
  unit: "days",
  counting: "working",
  limitAmount: null,
  renewal: "calendar_year",
  allowNegative: false,
  carryOver: false,
  requiresApproval: true,
  private: false,
  hiddenFromEmployee: false,
  attachment: "none",
  timeImpact: "reduce_theoretical",
  intersectSchedule: true,
  halfDay: false,
  minConsecutive: null,
  maxConsecutive: null,
  blockedDates: [],
  paid: true,
  flowId: null,
};
const TIME = /^\d{2}:\d{2}$/;
const MAX_DAYS = 366;
const PLAN_CHUNK = 62;
const plusDays = (d: string, n: number) => DateTime.fromISO(d, { zone: "utc" }).plus({ days: n }).toISODate()!;
const daysBetween = (a: string, b: string) => Math.round(DateTime.fromISO(b, { zone: "utc" }).diff(DateTime.fromISO(a, { zone: "utc" }), "days").days) + 1;

export interface Actor {
  userId: string;
  email: string;
}

export interface RequestInput {
  employeeId: string;
  typeId: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  halfDay: boolean;
  comment: string | null;
  attachmentDocumentId: string | null;
  /** Anexo carregado pelo próprio (`uploadMyAttachment`); só aceite da pasta dele. */
  attachment?: AbsenceAttachment | null;
}

/** Pedido como aparece nas vistas; ausências privadas ficam mascaradas (ADR-0028). */
export interface RequestView extends Omit<AbsenceRequest, "attachment"> {
  /** Só «tem anexo» (nome e tipo); nunca o caminho. Mascarado: nome genérico. Abre-se por `attachmentUrl`. */
  attachment: { name: string; mime: string } | null;
  typeName: string;
  typeColor: string | null;
  /** Categoria do tipo (ex.: "vacation"); null quando a ausência está mascarada. */
  typeCategory: string | null;
  private: boolean;
}

export class AbsencesUseCases {
  constructor(
    private readonly repo: AbsencesRepositoryPort,
    private readonly ctx: AbsencesContextPort,
    private readonly notifier: AbsencesNotifierPort,
    private readonly audit: AbsencesAuditPort,
    private readonly clock: AbsencesClockPort,
    private readonly periods: PeriodGuardPort = { closedDates: async () => new Set<string>() },
    private readonly attachments: AbsenceAttachmentStoragePort | null = null,
  ) {}

  // ── Anexos carregados pelo próprio (Portal: justificar falta) ───────
  /** Guarda o ficheiro na pasta do colaborador; o pedido usa depois o caminho devolvido. */
  async uploadMyAttachment(org: OrganizationId, actor: Actor, file: { name: string; mime: string; bytes: Buffer }): Promise<AbsenceAttachment> {
    if (!this.attachments) throw new AbsenceRuleError("Anexos indisponíveis.", "attachments_unavailable");
    validateAttachmentFile({ name: file.name, mime: file.mime, size: file.bytes.length });
    const employeeId = await this.myEmployeeId(org, actor);
    const name = safeFileName(file.name);
    const path = await this.attachments.upload(org, `${attachmentFolder(employeeId)}${randomUUID()}-${name}`, file.bytes, file.mime);
    return { path, name, mime: file.mime };
  }

  /**
   * Link temporário do anexo de um pedido: o próprio, quem aprova em algum
   * nível do pedido, ou a gestão (o controller verifica o âmbito antes).
   */
  async attachmentUrl(org: OrganizationId, actor: Actor, requestId: string, as: "owner" | "approver" | "manager"): Promise<{ url: string; name: string; mime: string }> {
    const r = await this.repo.getRequest(org, requestId);
    if (!r?.attachment || !this.attachments) throw new AbsenceNotFoundError("Anexo não encontrado.");
    if (as === "owner" && (await this.ctx.employeeForUser(org, actor.userId)) !== r.employeeId) throw new AbsenceNotFoundError("Anexo não encontrado.");
    if (as === "approver" && !r.levels.some((l) => l.approvers.includes(actor.userId))) throw new AbsenceForbiddenError("Não é aprovador deste pedido.", "not_approver");
    return { url: await this.attachments.signedUrl(org, r.attachment.path), name: r.attachment.name, mime: r.attachment.mime };
  }

  /** TK-17: ausências com dias num período fechado não se criam, aprovam nem cancelam. */
  private async assertOpen(org: OrganizationId, employeeId: string, from: string, to: string) {
    const closed = await this.periods.closedDates(org, employeeId, from, to);
    if (closed.size) throw new AbsenceConflictError(`O dia ${[...closed].sort()[0]} está num período fechado. Peça a reabertura do período.`, "period_closed");
  }

  private log(org: OrganizationId, actor: string, action: string, resourceType: string, resourceId: string | null, before: unknown, after: unknown, reason: string | null = null) {
    return this.audit.record(org, { actor, action, resourceType, resourceId, before, after, reason });
  }

  // ── Tipos ───────────────────────────────────────────────────────────
  listTypes(org: OrganizationId) {
    return this.repo.listTypes(org);
  }

  private async checkTypeName(org: OrganizationId, name: string, exceptId: string | null) {
    const lower = name.trim().toLocaleLowerCase("pt");
    if ((await this.repo.listTypes(org)).some((t) => !t.archived && t.id !== exceptId && t.name.toLocaleLowerCase("pt") === lower)) {
      throw new AbsenceConflictError("Já existe um tipo de ausência com este nome.", "duplicate_name");
    }
  }

  private async checkFlowRef(org: OrganizationId, flowId: string | null) {
    if (flowId && !(await this.repo.listFlows(org)).some((f) => f.id === flowId && !f.archived)) throw new AbsenceValidationError("Fluxo de aprovação não encontrado.", "flowId");
  }

  async createType(org: OrganizationId, actor: Actor, input: AbsenceTypeInput) {
    validateType(input);
    await this.checkTypeName(org, input.name, null);
    await this.checkFlowRef(org, input.flowId);
    const t = await this.repo.createType(org, { ...input, name: input.name.trim() }, actor.email);
    await this.log(org, actor.email, "absences.type.create", "absence_type", t.id, null, t);
    return t;
  }

  async updateType(org: OrganizationId, actor: Actor, id: string, input: AbsenceTypeInput) {
    const cur = (await this.repo.listTypes(org)).find((t) => t.id === id && !t.archived);
    if (!cur) throw new AbsenceNotFoundError("Tipo de ausência não encontrado.");
    validateType(input);
    await this.checkTypeName(org, input.name, id);
    await this.checkFlowRef(org, input.flowId);
    const t = await this.repo.updateType(org, id, { ...input, name: input.name.trim() });
    await this.log(org, actor.email, "absences.type.update", "absence_type", id, cur, t);
    return t;
  }

  async archiveType(org: OrganizationId, actor: Actor, id: string) {
    const cur = (await this.repo.listTypes(org)).find((t) => t.id === id && !t.archived);
    if (!cur) throw new AbsenceNotFoundError("Tipo de ausência não encontrado.");
    await this.repo.archiveType(org, id);
    await this.log(org, actor.email, "absences.type.archive", "absence_type", id, cur, null);
  }

  // ── Fluxos de aprovação (CF-5) ──────────────────────────────────────
  listFlows(org: OrganizationId) {
    return this.repo.listFlows(org);
  }

  /** CF-5: além da forma, cada perfil usado tem de ter pelo menos uma pessoa. */
  private async validateFlowHolders(org: OrganizationId, f: ApprovalFlowInput) {
    validateFlow(f);
    for (const [i, l] of f.levels.entries()) {
      if (l.people.length) continue;
      const profiles = l.roles.filter((r) => r.startsWith("profile:"));
      if (profiles.length === l.roles.length) {
        const holders = (await Promise.all(profiles.map((p) => this.ctx.profileUserIds(org, p.slice(8))))).flat();
        if (!holders.length) throw new AbsenceValidationError(`O nível ${i + 1} não tem aprovadores: o perfil escolhido não tem ninguém.`, "levels");
      }
    }
  }

  /**
   * Portal ligado ao Novo RH (ticket 05): garante o tipo «Folga» (código
   * FOLGA) — pedir folga à chefia, aprovado pelos responsáveis diretos (fluxo
   * «Chefia direta», papel `managers`; sem chefia, segue para o recurso =
   * administradores). Valores seguros dos tipos novos (ADR-0028: sem limite,
   * sem valores legais); a empresa pode editá-lo. Idempotente: se já existir
   * um tipo FOLGA ativo, não cria nada.
   */
  async ensureDayOffType(org: OrganizationId, actor: Actor): Promise<{ type: AbsenceType; created: boolean }> {
    const existing = (await this.repo.listTypes(org)).find((t) => !t.archived && t.code?.toUpperCase() === DAY_OFF_CODE);
    if (existing) return { type: existing, created: false };
    const flows = await this.repo.listFlows(org);
    const managerFlow =
      flows.find((f) => !f.archived && f.scope === "absences" && f.levels.length === 1 && f.levels[0]!.people.length === 0 && f.levels[0]!.roles.length === 1 && f.levels[0]!.roles[0] === "managers") ??
      (await this.createFlow(org, actor, { name: "Chefia direta", scope: "absences", isDefault: false, levels: [{ people: [], roles: ["managers"] }], fallbackUserIds: [] }));
    const type = await this.createType(org, actor, { ...SAFE_TYPE, name: "Folga", code: DAY_OFF_CODE, flowId: managerFlow.id });
    return { type, created: true };
  }

  async createFlow(org: OrganizationId, actor: Actor, input: ApprovalFlowInput) {
    await this.validateFlowHolders(org, input);
    const f = await this.repo.createFlow(org, { ...input, name: input.name.trim() }, actor.email);
    if (f.isDefault) await this.repo.clearDefault(org, f.scope, f.id);
    await this.log(org, actor.email, "approvals.flow.create", "approval_flow", f.id, null, f);
    return f;
  }

  async updateFlow(org: OrganizationId, actor: Actor, id: string, input: ApprovalFlowInput) {
    const cur = (await this.repo.listFlows(org)).find((f) => f.id === id && !f.archived);
    if (!cur) throw new AbsenceNotFoundError("Fluxo não encontrado.");
    await this.validateFlowHolders(org, input);
    const f = await this.repo.updateFlow(org, id, { ...input, name: input.name.trim() });
    if (f.isDefault) await this.repo.clearDefault(org, f.scope, f.id);
    await this.log(org, actor.email, "approvals.flow.update", "approval_flow", id, cur, f);
    return f;
  }

  async archiveFlow(org: OrganizationId, actor: Actor, id: string) {
    const cur = (await this.repo.listFlows(org)).find((f) => f.id === id && !f.archived);
    if (!cur) throw new AbsenceNotFoundError("Fluxo não encontrado.");
    if ((await this.repo.listTypes(org)).some((t) => !t.archived && t.flowId === id)) throw new AbsenceValidationError("Há tipos de ausência que usam este fluxo.", "id");
    await this.repo.archiveFlow(org, id);
    await this.log(org, actor.email, "approvals.flow.archive", "approval_flow", id, cur, null);
  }

  // ── Pedidos ─────────────────────────────────────────────────────────
  private async planDays(org: OrganizationId, employeeId: string, from: string, to: string): Promise<PlanDay[]> {
    const out: PlanDay[] = [];
    for (let s = from; s <= to; s = plusDays(s, PLAN_CHUNK)) {
      const e = plusDays(s, PLAN_CHUNK - 1) < to ? plusDays(s, PLAN_CHUNK - 1) : to;
      out.push(...(await this.ctx.planDays(org, employeeId, s, e)));
    }
    return out;
  }

  private async rules(org: OrganizationId, type: AbsenceType, employeeId: string, date: string): Promise<LeaveRules> {
    return rulesFor(type, type.category === "vacation" ? await this.ctx.vacationRulesFor(org, employeeId, date) : null);
  }

  /** Acumulação do período, criada uma vez (o índice único evita duplicados). */
  private async ensureAccrual(org: OrganizationId, employeeId: string, type: AbsenceType, rules: LeaveRules, period: string, contractStart: string | null) {
    const amount = accrualFor(rules, period, contractStart);
    if (amount === null) return;
    const entries = await this.repo.listEntries(org, { employeeId, typeId: type.id, period });
    if (entries.some((e) => e.kind === "accrual")) return;
    await this.repo.insertEntry(org, { employeeId, typeId: type.id, period, kind: "accrual", amount, unit: rules.unit, requestId: null, referenceDate: period, reason: "Acumulação do período", createdBy: "sistema" });
  }

  private async pendingAmount(org: OrganizationId, employeeId: string, typeId: string, period: string, exceptId: string | null = null) {
    return (await this.repo.listRequests(org, { employeeId, status: "pending" })).filter((r) => r.typeId === typeId && r.period === period && r.id !== exceptId).reduce((s, r) => s + r.amount, 0);
  }

  private async approverSets(org: OrganizationId, flow: ApprovalFlow | null, employeeId: string, date: string): Promise<{ resolved: string[][]; fallback: string[] }> {
    const admins = await this.ctx.adminUserIds(org);
    if (!flow) return { resolved: [admins], fallback: admins };
    const resolved: string[][] = [];
    for (const l of flow.levels) {
      const users = [...l.people];
      for (const role of l.roles) {
        if (role === "managers") users.push(...(await this.ctx.managerUserIds(org, employeeId, date)));
        else if (role.startsWith("profile:")) users.push(...(await this.ctx.profileUserIds(org, role.slice(8))));
      }
      resolved.push(users);
    }
    return { resolved, fallback: flow.fallbackUserIds.length ? flow.fallbackUserIds : admins };
  }

  /**
   * FE-113: níveis do fluxo "Correções de ponto" (âmbito clock) para um
   * colaborador — os mesmos aprovadores, recurso e regras que nas ausências.
   * null = não há fluxo de ponto ativo; "no_approver" = ninguém pode aprovar.
   */
  async correctionLevels(org: OrganizationId, employeeId: string, date: string, excludedUserIds: string[]) {
    const flows = (await this.repo.listFlows(org)).filter((f) => !f.archived && f.scope === "clock");
    const flow = flows.find((f) => f.isDefault) ?? flows[0] ?? null;
    if (!flow) return null;
    const sets = await this.approverSets(org, flow, employeeId, date);
    const employeeUser = await this.ctx.userOfEmployee(org, employeeId);
    return snapshotLevels(sets.resolved, new Set([...excludedUserIds, employeeUser].filter((x): x is string => !!x)), sets.fallback) ?? ("no_approver" as const);
  }

  private async flowFor(org: OrganizationId, type: AbsenceType): Promise<ApprovalFlow | null> {
    const flows = (await this.repo.listFlows(org)).filter((f) => !f.archived && f.scope === "absences");
    return flows.find((f) => f.id === type.flowId) ?? flows.find((f) => f.isDefault) ?? null;
  }

  private async notifyLevel(org: OrganizationId, r: AbsenceRequest, typeName: string) {
    const level = r.levels[r.currentLevel];
    if (!level) return;
    if (level.escalated) {
      await this.repo.insertDecision(org, { requestId: r.id, level: r.currentLevel, actor: "sistema", actorUserId: null, decision: "escalated", comment: "Nível sem aprovador: enviado para o recurso." });
    }
    await this.notifier.notify(org, level.approvers, {
      title: level.escalated ? "Pedido de ausência escalado para si" : "Pedido de ausência para aprovar",
      body: `${typeName}: ${r.startDate}${r.endDate !== r.startDate ? ` a ${r.endDate}` : ""} (${r.amount} ${r.unit === "days" ? "dia(s)" : "hora(s)"}).${level.escalated ? " O nível do fluxo não tinha aprovador (ADR-0028)." : ""}`,
      link: "/hr/novo/ausencias",
      dedupeKey: `absence:${r.id}:${r.currentLevel}`,
    });
  }

  /**
   * Criar um pedido. `assign` = atribuído pela gestão (fica aprovado, salvo se
   * quem atribui é o próprio colaborador — aí segue o fluxo, RE-22).
   */
  async createRequest(org: OrganizationId, actor: Actor, input: RequestInput, mode: "self" | "assign"): Promise<AbsenceRequest> {
    if (!DATE.test(input.startDate) || !DATE.test(input.endDate) || input.endDate < input.startDate) throw new AbsenceValidationError("Datas inválidas.", "startDate");
    if (daysBetween(input.startDate, input.endDate) > MAX_DAYS) throw new AbsenceValidationError("Um pedido tem no máximo um ano.", "endDate");
    if ((input.startTime === null) !== (input.endTime === null) || (input.startTime && (!TIME.test(input.startTime) || !TIME.test(input.endTime!)))) throw new AbsenceValidationError("Horas inválidas.", "startTime");
    if (input.comment && input.comment.length > 1000) throw new AbsenceValidationError("Comentário demasiado longo.", "comment");
    const type = (await this.repo.listTypes(org)).find((t) => t.id === input.typeId && !t.archived);
    if (!type || (mode === "self" && type.hiddenFromEmployee)) throw new AbsenceNotFoundError("Tipo de ausência não encontrado.");
    // Pedido do próprio: nunca um id de documento arbitrário (podia ser de outra pessoa) — só o anexo que ele carregou.
    const documentId = mode === "self" ? null : input.attachmentDocumentId;
    const attachment = input.attachment ?? null;
    if (attachment && (type.attachment === "none" || !ownsAttachment(attachment.path, org, input.employeeId))) throw new AbsenceValidationError("Anexo inválido.", "attachment");
    if (type.attachment === "required" && !documentId && !attachment) throw new AbsenceRuleError("Este tipo de ausência exige um documento justificativo.", "attachment_required");

    const coverage = await this.ctx.contractCoverage(org, input.employeeId, input.startDate, input.endDate);
    if (!coverage.covered) throw new AbsenceRuleError("O pedido está fora da vigência do contrato.", "outside_contract");
    const rules = await this.rules(org, type, input.employeeId, input.startDate);
    if (input.halfDay && (!rules.halfDay || input.startDate !== input.endDate)) throw new AbsenceRuleError("Este tipo não permite meio dia (ou o pedido tem mais de um dia).", "half_day_not_allowed");
    if (rules.unit === "hours" && (!input.startTime || input.startDate !== input.endDate)) throw new AbsenceValidationError("Uma ausência por horas é num só dia, com hora de início e de fim.", "startTime");

    const days = await this.planDays(org, input.employeeId, input.startDate, input.endDate);
    const calc = requestAmount(rules, days, input);
    if (calc.unavailable) throw new AbsenceRuleError(`A data selecionada não está disponível com a configuração selecionada (${calc.unavailable}).`, "date_unavailable");
    const blocked = rules.blockedDates.find((d) => d >= input.startDate && d <= input.endDate);
    if (blocked) throw new AbsenceRuleError(`O dia ${blocked} está bloqueado para pedidos.`, "blocked_date");
    if (rules.unit === "days" && !input.halfDay) {
      if (rules.minConsecutive !== null && calc.amount < rules.minConsecutive) throw new AbsenceRuleError(`Mínimo de ${rules.minConsecutive} dia(s) por pedido.`, "min_consecutive");
      if (rules.maxConsecutive !== null && calc.amount > rules.maxConsecutive) throw new AbsenceRuleError(`Máximo de ${rules.maxConsecutive} dia(s) por pedido.`, "max_consecutive");
    }
    await this.assertOpen(org, input.employeeId, input.startDate, input.endDate);
    const existing = (await this.repo.listRequests(org, { employeeId: input.employeeId })).filter((r) => r.status === "pending" || r.status === "approved");
    if (existing.some((r) => r.kind === "absence" && overlaps(r, input))) throw new AbsenceConflictError("Já existe uma ausência pedida ou aprovada nestas datas.", "overlap");

    const period = periodStart(rules.renewal, input.startDate, coverage.contractStart);
    await this.ensureAccrual(org, input.employeeId, type, rules, period, coverage.contractStart);
    if (rules.limit !== null && !rules.allowNegative) {
      const s = summarize(await this.repo.listEntries(org, { employeeId: input.employeeId, typeId: type.id, period }), await this.pendingAmount(org, input.employeeId, type.id, period));
      if (calc.amount > s.available) throw new AbsenceRuleError(`Saldo insuficiente: disponível ${s.available}, pedido ${calc.amount}.`, "insufficient_balance");
    }

    const employeeUser = await this.ctx.userOfEmployee(org, input.employeeId);
    const isSelf = actor.userId === employeeUser;
    const autoApprove = !type.requiresApproval || (mode === "assign" && !isSelf);
    let levels: AbsenceRequest["levels"] = [];
    if (!autoApprove) {
      const sets = await this.approverSets(org, await this.flowFor(org, type), input.employeeId, input.startDate);
      const snap = snapshotLevels(sets.resolved, new Set([actor.userId, employeeUser].filter((x): x is string => !!x)), sets.fallback);
      if (!snap) throw new AbsenceRuleError("Não há ninguém que possa aprovar este pedido. Configure pessoas de recurso no fluxo.", "no_approver");
      levels = snap;
    }
    const r = await this.repo.insertRequest(org, {
      employeeId: input.employeeId,
      typeId: type.id,
      kind: "absence",
      startDate: input.startDate,
      endDate: input.endDate,
      startTime: input.startTime,
      endTime: input.endTime,
      halfDay: input.halfDay,
      amount: calc.amount,
      unit: rules.unit,
      period,
      status: autoApprove ? "approved" : "pending",
      comment: input.comment?.trim() || null,
      attachmentDocumentId: documentId,
      attachment,
      requestedBy: actor.email,
      requestedByUserId: actor.userId,
      levels,
      currentLevel: 0,
    });
    await this.log(org, actor.email, mode === "assign" ? "absences.request.assign" : "absences.request.create", "absence_request", r.id, null, r, r.comment);
    if (autoApprove) await this.consume(org, r, actor.email);
    else await this.notifyLevel(org, r, type.name);
    return r;
  }

  /** Movimento de saldo de um pedido aprovado. */
  private async consume(org: OrganizationId, r: AbsenceRequest, by: string) {
    if (r.kind === "holiday_compensation") {
      await this.repo.insertEntry(org, { employeeId: r.employeeId, typeId: r.typeId, period: r.period, kind: "holiday_compensation", amount: r.amount, unit: r.unit, requestId: r.id, referenceDate: r.startDate, reason: "Compensação de feriado trabalhado (aprovada)", createdBy: by });
      return;
    }
    await this.repo.insertEntry(org, { employeeId: r.employeeId, typeId: r.typeId, period: r.period, kind: "request", amount: -r.amount, unit: r.unit, requestId: r.id, referenceDate: r.startDate, reason: "Ausência aprovada", createdBy: by });
  }

  /** Aprovar ou recusar no nível atual. Só quem está no nível; nunca quem pediu (RE-22). */
  async decide(org: OrganizationId, actor: Actor, id: string, decision: "approve" | "reject", comment: string | null) {
    const r = await this.repo.getRequest(org, id);
    if (!r) throw new AbsenceNotFoundError("Pedido não encontrado.");
    if (r.status !== "pending") throw new AbsenceConflictError("Este pedido já não está pendente.", "not_pending");
    if (actor.userId === r.requestedByUserId || actor.userId === (await this.ctx.userOfEmployee(org, r.employeeId))) throw new AbsenceForbiddenError("Não pode decidir um pedido seu.", "self_approval");
    const level = r.levels[r.currentLevel];
    if (!level?.approvers.includes(actor.userId)) throw new AbsenceForbiddenError("Não é aprovador deste pedido neste nível.", "not_approver");
    const last = r.currentLevel >= r.levels.length - 1;
    const patch =
      decision === "reject"
        ? { status: "rejected" as RequestStatus, decidedAt: new Date().toISOString() }
        : last
          ? { status: "approved" as RequestStatus, decidedAt: new Date().toISOString() }
          : { currentLevel: r.currentLevel + 1 };
    if (patch.status === "approved") await this.assertOpen(org, r.employeeId, r.startDate, r.endDate);
    const updated = await this.repo.updateRequest(org, id, { status: "pending", currentLevel: r.currentLevel }, patch);
    if (!updated) throw new AbsenceConflictError("Este pedido acabou de ser decidido por outra pessoa.", "already_decided");
    await this.repo.insertDecision(org, { requestId: id, level: r.currentLevel, actor: actor.email, actorUserId: actor.userId, decision, comment: comment?.trim() || null });
    await this.log(org, actor.email, `absences.request.${decision}`, "absence_request", id, r, updated, comment);
    const type = (await this.repo.listTypes(org)).find((t) => t.id === r.typeId);
    if (updated.status === "approved") await this.consume(org, updated, actor.email);
    if (updated.status === "pending") await this.notifyLevel(org, updated, type?.name ?? "Ausência");
    if (updated.status !== "pending" && r.requestedByUserId) {
      await this.notifier.notify(org, [r.requestedByUserId], {
        title: updated.status === "approved" ? "Ausência aprovada" : "Ausência recusada",
        body: `${type?.name ?? "Ausência"}: ${r.startDate}${r.endDate !== r.startDate ? ` a ${r.endDate}` : ""}.${comment?.trim() ? ` Comentário: ${comment.trim()}` : ""}`,
        link: "/hr/novo/ausencias",
        dedupeKey: `absence:${id}:decided`,
      });
    }
    return updated;
  }

  /**
   * Cancelar: pendente → quem pediu, o colaborador ou a gestão; aprovada → só a
   * gestão, com motivo, e gera um movimento de anulação (RE-25).
   */
  async cancel(org: OrganizationId, actor: Actor, id: string, reason: string | null, canManage: boolean) {
    const r = await this.repo.getRequest(org, id);
    if (!r) throw new AbsenceNotFoundError("Pedido não encontrado.");
    if (r.status !== "pending" && r.status !== "approved") throw new AbsenceConflictError("Este pedido já não pode ser cancelado.", "not_pending");
    const own = actor.userId === r.requestedByUserId || actor.userId === (await this.ctx.userOfEmployee(org, r.employeeId));
    if (r.status === "pending" && !own && !canManage) throw new AbsenceForbiddenError("Só quem pediu ou a gestão podem cancelar.", "not_allowed");
    if (r.status === "approved") {
      if (!canManage) throw new AbsenceForbiddenError("Uma ausência aprovada só pode ser cancelada pela gestão.", "not_allowed");
      if (!reason?.trim()) throw new AbsenceValidationError("Indique o motivo do cancelamento.", "reason");
    }
    if (r.status === "approved") await this.assertOpen(org, r.employeeId, r.startDate, r.endDate);
    const updated = await this.repo.updateRequest(org, id, { status: r.status, currentLevel: r.currentLevel }, { status: "cancelled", cancelReason: reason?.trim() || null, decidedAt: new Date().toISOString() });
    if (!updated) throw new AbsenceConflictError("Este pedido acabou de mudar.", "already_decided");
    await this.repo.insertDecision(org, { requestId: id, level: r.currentLevel, actor: actor.email, actorUserId: actor.userId, decision: "cancel", comment: reason?.trim() || null });
    if (r.status === "approved") {
      const amount = r.kind === "holiday_compensation" ? -r.amount : r.amount;
      await this.repo.insertEntry(org, { employeeId: r.employeeId, typeId: r.typeId, period: r.period, kind: "reversal", amount, unit: r.unit, requestId: r.id, referenceDate: r.startDate, reason: `Cancelamento: ${reason!.trim()}`, createdBy: actor.email });
    }
    await this.log(org, actor.email, "absences.request.cancel", "absence_request", id, r, updated, reason);
    return updated;
  }

  // ── Leituras ────────────────────────────────────────────────────────
  private async views(org: OrganizationId, list: AbsenceRequest[], canPrivate: boolean, viewerUserId: string | null): Promise<RequestView[]> {
    const types = await this.repo.listTypes(org);
    const out: RequestView[] = [];
    for (const r of list) {
      const t = types.find((x) => x.id === r.typeId);
      const isPrivate = !!t?.private;
      // O próprio colaborador vê sempre as suas; sem a permissão, as privadas ficam mascaradas.
      const own = viewerUserId !== null && (viewerUserId === r.requestedByUserId || viewerUserId === (await this.ctx.userOfEmployee(org, r.employeeId)));
      const mask = isPrivate && !canPrivate && !own;
      const attachment = r.attachment ? { name: mask ? "Anexo" : r.attachment.name, mime: r.attachment.mime } : null;
      out.push({ ...r, attachment, comment: mask ? null : r.comment, typeName: mask ? "Ausência" : (t?.name ?? "—"), typeColor: mask ? null : (t?.color ?? null), typeCategory: mask ? null : (t?.category ?? null), private: isPrivate });
    }
    return out;
  }

  async listRequests(org: OrganizationId, filter: { status?: RequestStatus; employeeId?: string; from?: string; to?: string }, canPrivate: boolean, viewerUserId: string) {
    const list = (await this.repo.listRequests(org, filter)).filter((r) => (!filter.from || r.endDate >= filter.from) && (!filter.to || r.startDate <= filter.to));
    return this.views(org, list, canPrivate, viewerUserId);
  }

  async requestDetail(org: OrganizationId, id: string, canPrivate: boolean, viewerUserId: string) {
    const r = await this.repo.getRequest(org, id);
    if (!r) throw new AbsenceNotFoundError("Pedido não encontrado.");
    const [view] = await this.views(org, [r], canPrivate, viewerUserId);
    return { ...view!, decisions: await this.repo.listDecisions(org, id) };
  }

  getRequest(org: OrganizationId, id: string) {
    return this.repo.getRequest(org, id);
  }

  /** Caixa do aprovador: pedidos pendentes em que está no nível atual. */
  async myApprovals(org: OrganizationId, actor: Actor, canPrivate: boolean) {
    const pending = (await this.repo.listRequests(org, { status: "pending" })).filter((r) => r.levels[r.currentLevel]?.approvers.includes(actor.userId));
    return this.views(org, pending, canPrivate, actor.userId);
  }

  async myRequests(org: OrganizationId, actor: Actor) {
    const employeeId = await this.ctx.employeeForUser(org, actor.userId);
    if (!employeeId) throw new AbsenceNotFoundError("Esta conta não está ligada a uma ficha de colaborador.");
    return { employeeId, requests: await this.views(org, await this.repo.listRequests(org, { employeeId }), true, actor.userId) };
  }

  async myTypes(org: OrganizationId) {
    return (await this.repo.listTypes(org)).filter((t) => !t.archived && !t.hiddenFromEmployee);
  }

  async myEmployeeId(org: OrganizationId, actor: Actor) {
    const employeeId = await this.ctx.employeeForUser(org, actor.userId);
    if (!employeeId) throw new AbsenceNotFoundError("Esta conta não está ligada a uma ficha de colaborador.");
    return employeeId;
  }

  /** Saldos de um colaborador numa data, por tipo com limite (cria a acumulação do período se faltar). */
  async balances(org: OrganizationId, employeeId: string, date: string | null, canPrivate: boolean) {
    const at = date && DATE.test(date) ? date : await this.clock.today(org);
    const coverage = await this.ctx.contractCoverage(org, employeeId, at, at);
    const out = [];
    for (const type of (await this.repo.listTypes(org)).filter((t) => !t.archived && (canPrivate || !t.private))) {
      const rules = await this.rules(org, type, employeeId, at);
      const period = periodStart(rules.renewal, at, coverage.contractStart);
      if (coverage.covered) await this.ensureAccrual(org, employeeId, type, rules, period, coverage.contractStart);
      const entries = await this.repo.listEntries(org, { employeeId, typeId: type.id, period });
      if (rules.limit === null && entries.length === 0) continue;
      out.push({ typeId: type.id, typeName: type.name, unit: rules.unit, limited: rules.limit !== null, period, ...summarize(entries, await this.pendingAmount(org, employeeId, type.id, period)), entries });
    }
    return out;
  }

  async adjust(org: OrganizationId, actor: Actor, input: { employeeId: string; typeId: string; period: string; amount: number; reason: string }) {
    if (!input.reason?.trim()) throw new AbsenceValidationError("Indique o motivo do ajuste.", "reason");
    if (!Number.isFinite(input.amount) || input.amount === 0 || Math.abs(input.amount) > 1000) throw new AbsenceValidationError("Quantidade inválida.", "amount");
    if (!DATE.test(input.period)) throw new AbsenceValidationError("Período inválido.", "period");
    const type = (await this.repo.listTypes(org)).find((t) => t.id === input.typeId && !t.archived);
    if (!type) throw new AbsenceNotFoundError("Tipo de ausência não encontrado.");
    const rules = await this.rules(org, type, input.employeeId, input.period);
    const e = await this.repo.insertEntry(org, { employeeId: input.employeeId, typeId: type.id, period: input.period, kind: "adjustment", amount: input.amount, unit: rules.unit, requestId: null, referenceDate: null, reason: input.reason.trim(), createdBy: actor.email });
    await this.log(org, actor.email, "absences.balance.adjust", "leave_balance", input.employeeId, null, e, input.reason);
    return e;
  }

  // ── Efeito na assiduidade (CF-7) ────────────────────────────────────
  /** Por dia: minutos a tirar ao teórico, a somar ao trabalhado, e se o dia está justificado. */
  async dayEffects(org: OrganizationId, employeeId: string, from: string, to: string, theoretical: Map<string, number>): Promise<Map<string, DayEffect>> {
    // Só os pedidos que tocam o período (antes lia o histórico todo da pessoa e filtrava aqui).
    const [requests, types] = await Promise.all([this.repo.listRequests(org, { employeeId, status: "approved", from, to }), this.repo.listTypes(org)]);
    const out = new Map<string, DayEffect>();
    for (const r of requests) {
      if (r.kind !== "absence" || r.endDate < from || r.startDate > to) continue;
      const type = types.find((t) => t.id === r.typeId);
      if (!type) continue;
      for (let d = r.startDate > from ? r.startDate : from; d <= (r.endDate < to ? r.endDate : to); d = plusDays(d, 1)) {
        const theo = theoretical.get(d) ?? 0;
        const minutes = r.unit === "hours" ? Math.round(r.amount * 60) : r.halfDay ? Math.round(theo / 2) : "full";
        const e = absenceEffect(theo, type.timeImpact, minutes);
        const cur = out.get(d);
        out.set(d, cur ? { reduceMinutes: Math.min(theo, cur.reduceMinutes + e.reduceMinutes), creditMinutes: Math.min(theo, cur.creditMinutes + e.creditMinutes), excused: true } : e);
      }
    }
    return out;
  }

  // ── Compensação de feriados trabalhados (CF-9) ──────────────────────
  async holidayCompensation(org: OrganizationId, actor: Actor, employeeId: string, from: string, to: string) {
    if (!DATE.test(from) || !DATE.test(to) || to < from || daysBetween(from, to) > 92) throw new AbsenceValidationError("Período inválido (máx. 92 dias).", "from");
    const type = (await this.repo.listTypes(org)).find((t) => !t.archived && t.category === "compensation");
    if (!type) throw new AbsenceRuleError("Crie primeiro um tipo de ausência da categoria 'Compensação'.", "no_compensation_type");
    const coverage = await this.ctx.contractCoverage(org, employeeId, from, from);
    let granted = 0;
    let requested = 0;
    for (let d = from; d <= to; d = plusDays(d, 1)) {
      const h = await this.ctx.holidayOn(org, employeeId, d);
      if (!h || h.coefficient <= 0) continue;
      if ((await this.ctx.workedSeconds(org, employeeId, d)) <= 0) continue;
      const period = periodStart(type.renewal, d, coverage.contractStart);
      const existing = (await this.repo.listRequests(org, { employeeId })).some((r) => r.kind === "holiday_compensation" && r.startDate === d && r.status !== "rejected" && r.status !== "cancelled");
      if (existing) continue;
      if (h.approvalRequired) {
        const sets = await this.approverSets(org, await this.flowFor(org, type), employeeId, d);
        const employeeUser = await this.ctx.userOfEmployee(org, employeeId);
        const levels = snapshotLevels(sets.resolved, new Set([employeeUser].filter((x): x is string => !!x)), sets.fallback);
        if (!levels) throw new AbsenceRuleError("Não há ninguém que possa aprovar a compensação.", "no_approver");
        const r = await this.repo.insertRequest(org, {
          employeeId, typeId: type.id, kind: "holiday_compensation", startDate: d, endDate: d, startTime: null, endTime: null, halfDay: false,
          amount: h.coefficient, unit: "days", period, status: "pending", comment: `Feriado trabalhado: ${h.name}`, attachmentDocumentId: null, attachment: null,
          requestedBy: actor.email, requestedByUserId: null, levels, currentLevel: 0,
        });
        await this.notifyLevel(org, r, type.name);
        requested++;
      } else {
        const e = await this.repo.insertEntry(org, { employeeId, typeId: type.id, period, kind: "holiday_compensation", amount: h.coefficient, unit: "days", requestId: null, referenceDate: d, reason: `Feriado trabalhado: ${h.name}`, createdBy: actor.email });
        if (e) granted++;
      }
    }
    await this.log(org, actor.email, "absences.holiday_compensation", "employee", employeeId, null, { from, to, granted, requested });
    return { granted, requested };
  }
}
