import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { ShiftAutomation } from "../../domain/entities/shift-automation.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import {
  InvalidShiftAutomationError,
  InvalidTemplateApplicationError,
  ShiftAutomationNotFoundError,
  ShiftTemplateNotFoundError,
} from "../../domain/errors.js";
import type {
  AutomationGenerationResultDTO,
  CreateShiftAutomationCommand,
  CreateShiftAutomationPort,
  CreateShiftAutomationResultDTO,
  DismissAutomationIssuePort,
  GenerateAllAutomationsPort,
  GenerateAutomationCommand,
  GenerateAutomationPort,
  ListShiftAutomationsPort,
  SetShiftAutomationStatusCommand,
  SetShiftAutomationStatusPort,
  ShiftAutomationDTO,
  ShiftAutomationInput,
  UpdateShiftAutomationCommand,
  UpdateShiftAutomationPort,
} from "../../domain/ports/in/shift-automation.ports.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  AutomationIssueRepositoryPort,
  AutomationIssueStatus,
  ShiftAutomationRepositoryPort,
} from "../../domain/ports/out/shift-automation-repository.port.js";
import { computePlan, type TemplateApplicationDeps } from "./apply-shift-template.use-cases.js";

type Clock = () => Date;
const systemClock: Clock = () => new Date();
const todayOf = (now: Date) => now.toISOString().slice(0, 10);

export interface ShiftAutomationDeps extends TemplateApplicationDeps {
  automations: ShiftAutomationRepositoryPort;
  issues: AutomationIssueRepositoryPort;
  auditLog: HrAuditLogPort;
  clock?: Clock;
}

async function toDTO(deps: ShiftAutomationDeps, organizationId: OrganizationId, automation: ShiftAutomation, openIssues?: number): Promise<ShiftAutomationDTO> {
  const p = automation.toProps();
  const template = await deps.templates.findById(organizationId, p.templateId);
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    kind: p.kind,
    templateId: p.templateId,
    templateName: template?.name ?? "—",
    audience: p.audience,
    locationId: p.locationId,
    weekdays: p.weekdays,
    startDate: p.startDate,
    endDate: p.endDate,
    horizonWeeks: p.horizonWeeks,
    status: p.status,
    generatedUntil: p.generatedUntil,
    lastRunAt: p.lastRunAt,
    openIssues: openIssues ?? (await deps.issues.countOpenByAutomation(organizationId)).get(p.id) ?? 0,
    updatedAt: p.updatedAt,
  };
}

/** Modelo tem de existir e estar ativo; local (se indicado) tem de estar ativo. */
async function assertReferences(deps: ShiftAutomationDeps, organizationId: OrganizationId, input: Pick<ShiftAutomationInput, "templateId" | "locationId">): Promise<void> {
  const template = await deps.templates.findById(organizationId, input.templateId);
  if (!template) throw new ShiftTemplateNotFoundError(input.templateId);
  if (!template.active) throw new InvalidShiftAutomationError(`O modelo "${template.name}" está inativo`);
  if (input.locationId) {
    const location = await deps.locations.findOneForOrganization(organizationId, input.locationId);
    if (!location || !location.isActive) throw new InvalidShiftAutomationError("Local inexistente ou inativo");
  }
}

async function loadOrThrow(deps: ShiftAutomationDeps, organizationId: OrganizationId, id: string): Promise<ShiftAutomation> {
  const automation = await deps.automations.findById(organizationId, id);
  if (!automation) throw new ShiftAutomationNotFoundError(id);
  return automation;
}

/**
 * Gera uma automatização (task RH 2.0 §7): só dentro do horizonte e só
 * para datas ainda não geradas; público reavaliado agora; usa o mesmo
 * motor do "Aplicar modelo". Cria apenas ocorrências válidas — conflitos,
 * ausências e falta de local nunca são forçados: vão para "Alertas e
 * ações". Repetir nunca duplica (o que já existe conta como existente).
 */
async function generate(deps: ShiftAutomationDeps, organizationId: OrganizationId, actor: string, automation: ShiftAutomation, weeks?: number): Promise<AutomationGenerationResultDTO> {
  const now = (deps.clock ?? systemClock)();
  const p = automation.toProps();
  const window = automation.nextWindow(todayOf(now), weeks);
  const empty = { automationId: p.id, window, created: 0, alreadyExisting: 0, issues: 0 };
  if (automation.status !== "active" || window === null) return { ...empty, window: automation.status === "active" ? window : null };

  let plan;
  try {
    plan = await computePlan(deps, organizationId, {
      templateId: p.templateId,
      audience: p.audience,
      days: { kind: "range", from: window.from, to: window.to, weekdays: p.weekdays },
      locationId: p.locationId,
    });
  } catch (e) {
    // Nenhum dia da semana no intervalo ainda por gerar → avança na mesma.
    if (e instanceof InvalidTemplateApplicationError && /não tem nenhum dos dias/.test(e.message)) {
      await deps.automations.update(organizationId, automation.recordRun(window.to, now));
      return empty;
    }
    throw e;
  }

  let created = 0;
  let alreadyExisting = 0;
  const issues: { automationId: string; employeeId: string; workDate: string; status: AutomationIssueStatus }[] = [];
  for (const o of plan.occurrences) {
    if (o.status === "duplicate") {
      alreadyExisting++;
      continue;
    }
    if (o.status !== "valid") {
      issues.push({ automationId: p.id, employeeId: o.employeeId, workDate: o.workDate, status: o.status });
      continue;
    }
    const first = o.segments[0]!;
    await deps.workShifts.create(
      organizationId,
      WorkShift.create({
        employeeId: o.employeeId,
        workDate: o.workDate,
        startTime: first.startTime,
        endTime: first.endTime,
        endsNextDay: o.endsNextDay,
        ...(o.segments[1] && { secondStartTime: o.segments[1].startTime, secondEndTime: o.segments[1].endTime }),
        locationId: o.locationId!,
        breakMinutes: plan.template.toProps().breakMinutes,
        status: "draft",
        source: "automation",
        templateId: p.templateId,
        automationId: p.id,
      }),
    );
    created++;
  }
  if (issues.length > 0) await deps.issues.upsertMany(organizationId, issues);
  await deps.automations.update(organizationId, automation.recordRun(window.to, now));
  await deps.auditLog.record({
    organizationId,
    actor,
    entityType: "shift_automation",
    entityId: p.id,
    action: "generated",
    description: `Automatização "${p.name}" gerou ${created} turno(s) de ${window.from} a ${window.to}${
      issues.length > 0 ? `; ${issues.length} ocorrência(s) por resolver em Alertas e ações` : ""
    }`,
    after: { window, created, alreadyExisting, issues: issues.length },
    correlationId: randomUUID(),
  });
  return { automationId: p.id, window, created, alreadyExisting, issues: issues.length };
}

export class ListShiftAutomationsUseCase implements ListShiftAutomationsPort {
  constructor(private readonly deps: ShiftAutomationDeps) {}

  async execute(organizationId: OrganizationId): Promise<ShiftAutomationDTO[]> {
    const [all, counts] = await Promise.all([this.deps.automations.findAll(organizationId), this.deps.issues.countOpenByAutomation(organizationId)]);
    const sorted = all.sort((a, b) => Number(a.status === "paused") - Number(b.status === "paused") || a.name.localeCompare(b.name, "pt"));
    return Promise.all(sorted.map((a) => toDTO(this.deps, organizationId, a, counts.get(a.id) ?? 0)));
  }
}

export class CreateShiftAutomationUseCase implements CreateShiftAutomationPort {
  constructor(private readonly deps: ShiftAutomationDeps) {}

  async execute(command: CreateShiftAutomationCommand): Promise<CreateShiftAutomationResultDTO> {
    const { organizationId, actor, generateNow, ...input } = command;
    const now = (this.deps.clock ?? systemClock)();
    await assertReferences(this.deps, organizationId, input);
    const automation = ShiftAutomation.create(randomUUID(), input, actor, now);
    await this.deps.automations.insert(organizationId, automation);
    await this.deps.auditLog.record({
      organizationId,
      actor,
      entityType: "shift_automation",
      entityId: automation.id,
      action: "created",
      description: `Automatização "${automation.name}" criada`,
      after: automation.toProps(),
      correlationId: randomUUID(),
    });
    const generation = generateNow ? await generate(this.deps, organizationId, actor, automation) : null;
    const saved = (await this.deps.automations.findById(organizationId, automation.id)) ?? automation;
    return { automation: await toDTO(this.deps, organizationId, saved), generation };
  }
}

export class UpdateShiftAutomationUseCase implements UpdateShiftAutomationPort {
  constructor(private readonly deps: ShiftAutomationDeps) {}

  async execute(command: UpdateShiftAutomationCommand): Promise<ShiftAutomationDTO> {
    const { organizationId, actor, id, ...changes } = command;
    const before = await loadOrThrow(this.deps, organizationId, id);
    const after = before.update(changes, (this.deps.clock ?? systemClock)());
    const p = after.toProps();
    if (changes.templateId !== undefined || changes.locationId !== undefined) await assertReferences(this.deps, organizationId, p);
    await this.deps.automations.update(organizationId, after);
    await this.deps.auditLog.record({
      organizationId,
      actor,
      entityType: "shift_automation",
      entityId: id,
      action: "updated",
      description: `Automatização "${after.name}" alterada (só afeta gerações futuras)`,
      before: before.toProps(),
      after: p,
      correlationId: randomUUID(),
    });
    return toDTO(this.deps, organizationId, after);
  }
}

export class SetShiftAutomationStatusUseCase implements SetShiftAutomationStatusPort {
  constructor(private readonly deps: ShiftAutomationDeps) {}

  async execute(command: SetShiftAutomationStatusCommand): Promise<ShiftAutomationDTO> {
    const before = await loadOrThrow(this.deps, command.organizationId, command.id);
    if (before.status === command.status) return toDTO(this.deps, command.organizationId, before);
    if (command.status === "active") await assertReferences(this.deps, command.organizationId, before.toProps());
    const after = before.setStatus(command.status, (this.deps.clock ?? systemClock)());
    await this.deps.automations.update(command.organizationId, after);
    await this.deps.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "shift_automation",
      entityId: command.id,
      action: command.status === "active" ? "activated" : "paused",
      description: `Automatização "${after.name}" ${command.status === "active" ? "ativada" : "pausada"}`,
      before: before.toProps(),
      after: after.toProps(),
      correlationId: randomUUID(),
    });
    return toDTO(this.deps, command.organizationId, after);
  }
}

/** "Gerar próximas X semanas". */
export class GenerateAutomationUseCase implements GenerateAutomationPort {
  constructor(private readonly deps: ShiftAutomationDeps) {}

  async execute(command: GenerateAutomationCommand): Promise<AutomationGenerationResultDTO> {
    const automation = await loadOrThrow(this.deps, command.organizationId, command.id);
    if (automation.status !== "active") throw new InvalidShiftAutomationError("A automatização está pausada — ative-a antes de gerar");
    return generate(this.deps, command.organizationId, command.actor, automation, command.weeks);
  }
}

/** Cron diário (`/api/internal/cron/hr-shift-automations`, R5). */
export class GenerateAllAutomationsUseCase implements GenerateAllAutomationsPort {
  constructor(private readonly deps: ShiftAutomationDeps) {}

  async execute(command: { organizationId: OrganizationId; actor: string }) {
    const results: AutomationGenerationResultDTO[] = [];
    const failed: { automationId: string; error: string }[] = [];
    for (const automation of await this.deps.automations.findAll(command.organizationId)) {
      if (automation.status !== "active") continue;
      try {
        results.push(await generate(this.deps, command.organizationId, command.actor, automation));
      } catch (e) {
        failed.push({ automationId: automation.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { results, failed };
  }
}

export class DismissAutomationIssueUseCase implements DismissAutomationIssuePort {
  constructor(private readonly deps: ShiftAutomationDeps) {}

  async execute(command: { organizationId: OrganizationId; actor: string; id: string }): Promise<void> {
    const issue = await this.deps.issues.findById(command.organizationId, command.id);
    if (!issue) throw new ShiftAutomationNotFoundError(command.id);
    if (issue.dismissedAt) return;
    await this.deps.issues.dismiss(command.organizationId, command.id, command.actor, (this.deps.clock ?? systemClock)());
    await this.deps.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "shift_automation",
      entityId: issue.automationId,
      employeeId: issue.employeeId,
      action: "issue_dismissed",
      description: `Ocorrência da automatização em ${issue.workDate} dispensada`,
      correlationId: randomUUID(),
    });
  }
}
