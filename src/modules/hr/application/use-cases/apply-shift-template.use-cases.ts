import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import { WorkShift } from "../../domain/entities/work-shift.js";
import type { ShiftTemplate } from "../../domain/entities/shift-template.js";
import { InvalidTemplateApplicationError, ShiftTemplateNotFoundError } from "../../domain/errors.js";
import type {
  ApplyTemplateCommand,
  ApplyTemplatePort,
  ApplyTemplateResultDTO,
  PreviewTemplateApplicationCommand,
  PreviewTemplateApplicationPort,
  TemplateApplicationConfig,
  TemplateApplicationPreviewDTO,
  TemplateOccurrenceDTO,
} from "../../domain/ports/in/shift-template.ports.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { ShiftTemplateRepositoryPort } from "../../domain/ports/out/shift-template-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import {
  expandApplicationDays,
  planTemplateApplication,
  resolveAudience,
  resolveConfirmation,
  type PlannedTemplateOccurrence,
} from "../../domain/services/template-application.service.js";
import { addDays } from "./schedule-shared.js";

export interface TemplateApplicationDeps {
  templates: ShiftTemplateRepositoryPort;
  employees: EmployeeRepositoryPort;
  workShifts: WorkShiftRepositoryPort;
  locations: LocationRepositoryPort;
  leaveRead: LeaveReadPort;
  holidayRead: HolidayReadPort;
}

export interface ComputedPlan {
  template: ShiftTemplate;
  occurrences: PlannedTemplateOccurrence[];
  employeeById: Map<string, { fullName: string; positionId: string | null }>;
  existingById: Map<string, WorkShift>;
}

/**
 * Carrega tudo o que o motor puro precisa, com os dados atuais — chamado
 * na pré-visualização e de novo na confirmação (revalidação, task §5).
 */
export async function computePlan(deps: TemplateApplicationDeps, organizationId: OrganizationId, config: TemplateApplicationConfig): Promise<ComputedPlan> {
  const template = await deps.templates.findById(organizationId, config.templateId);
  if (!template) throw new ShiftTemplateNotFoundError(config.templateId);
  if (!template.active) throw new InvalidTemplateApplicationError(`O modelo "${template.name}" está inativo`);

  let dates: string[];
  try {
    dates = expandApplicationDays(config.days);
  } catch (e) {
    if (e instanceof RangeError) throw new InvalidTemplateApplicationError(e.message);
    throw e;
  }
  if (config.audience.kind === "employees" && config.audience.employeeIds.length === 0) {
    throw new InvalidTemplateApplicationError("Escolha pelo menos um colaborador");
  }

  const from = dates[0]!;
  const to = dates[dates.length - 1]!;
  const [allEmployees, locations, existingShifts, leaves, holidays] = await Promise.all([
    deps.employees.findMany(organizationId, { status: "all" }),
    deps.locations.findAllForOrganization(organizationId),
    // ±1 dia: turnos noturnos de um dia vizinho podem sobrepor-se.
    deps.workShifts.findInRange(organizationId, { from: addDays(from, -1), to: addDays(to, 1) }),
    deps.leaveRead.findActiveInRange(organizationId, from, to),
    deps.holidayRead.findInRange(organizationId, from, to),
  ]);
  const employees = resolveAudience(config.audience, allEmployees);
  const audienceIds = new Set(employees.map((e) => e.id));
  const relevantShifts = existingShifts.filter((s) => audienceIds.has(s.employeeId));
  const attendance = await deps.workShifts.findAttendanceStatusesByShiftIds(
    organizationId,
    relevantShifts.map((s) => s.id),
  );

  const p = template.toProps();
  const occurrences = planTemplateApplication({
    template: { segments: template.segments, endsNextDay: p.endsNextDay, locationId: p.locationId },
    employees,
    dates,
    applicationLocationId: config.locationId,
    activeLocationIds: new Set(locations.filter((l) => l.isActive).map((l) => l.id)),
    existingShifts: relevantShifts,
    shiftIdsWithAttendance: new Set(attendance.keys()),
    leaves,
    holidays,
  });
  return {
    template,
    occurrences,
    employeeById: new Map(allEmployees.map((e) => [e.id, { fullName: e.fullName, positionId: e.positionId }])),
    existingById: new Map(relevantShifts.map((s) => [s.id, s])),
  };
}

function toOccurrenceDTO(o: PlannedTemplateOccurrence, plan: ComputedPlan): TemplateOccurrenceDTO {
  const employee = plan.employeeById.get(o.employeeId);
  const existing = o.existingShiftId ? plan.existingById.get(o.existingShiftId) : undefined;
  return {
    key: o.key,
    employeeId: o.employeeId,
    employeeName: employee?.fullName ?? o.employeeId,
    positionId: employee?.positionId ?? null,
    workDate: o.workDate,
    startTime: o.segments[0]!.startTime,
    endTime: o.segments[0]!.endTime,
    secondStartTime: o.segments[1]?.startTime ?? null,
    secondEndTime: o.segments[1]?.endTime ?? null,
    endsNextDay: o.endsNextDay,
    locationId: o.locationId,
    status: o.status,
    holidayName: o.holidayName,
    existingShift: existing
      ? {
          id: existing.id,
          startTime: existing.startTime,
          endTime: existing.endTime,
          secondStartTime: existing.secondStartTime,
          secondEndTime: existing.secondEndTime,
          locationId: existing.locationId,
        }
      : null,
    existingHasAttendance: o.existingHasAttendance,
  };
}

/** Escalas → Modelos → "Aplicar modelo", passo 2 (pré-visualização). Não grava nada. */
export class PreviewTemplateApplicationUseCase implements PreviewTemplateApplicationPort {
  constructor(private readonly deps: TemplateApplicationDeps) {}

  async execute(command: PreviewTemplateApplicationCommand): Promise<TemplateApplicationPreviewDTO> {
    const plan = await computePlan(this.deps, command.organizationId, command);
    const count = (...statuses: string[]) => plan.occurrences.filter((o) => statuses.includes(o.status)).length;
    return {
      occurrences: plan.occurrences
        .map((o) => toOccurrenceDTO(o, plan))
        .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.employeeName.localeCompare(b.employeeName, "pt")),
      summary: {
        employees: new Set(plan.occurrences.map((o) => o.employeeId)).size,
        valid: count("valid"),
        duplicate: count("duplicate"),
        overlap: count("overlap"),
        unavailable: count("leave"),
        inactive: count("inactive_employee", "no_location", "inactive_location"),
        holidays: plan.occurrences.filter((o) => o.holidayName !== null && o.status === "valid").length,
      },
    };
  }
}

/**
 * Passo 3 (confirmar): recalcula o plano com os dados atuais e aplica só o
 * que o utilizador decidiu e continua válido. Turnos em rascunho (R1),
 * `source: "template"` com referência ao modelo; o horário/local ficam
 * copiados (snapshot). "Substituir" só remove turnos sem presença (R3),
 * verificado de novo imediatamente antes.
 */
export class ApplyTemplateUseCase implements ApplyTemplatePort {
  constructor(
    private readonly deps: TemplateApplicationDeps,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: ApplyTemplateCommand): Promise<ApplyTemplateResultDTO> {
    const plan = await computePlan(this.deps, command.organizationId, command);
    const outcomes = resolveConfirmation(plan.occurrences, command.decisions);
    const correlationId = randomUUID();
    const nameOf = (id: string) => plan.employeeById.get(id)?.fullName ?? id;

    let created = 0;
    let replaced = 0;
    let skipped = 0;
    const changed: ApplyTemplateResultDTO["changed"] = [];
    const markChanged = (o: PlannedTemplateOccurrence) =>
      changed.push({ key: o.key, employeeName: nameOf(o.employeeId), workDate: o.workDate, status: o.status });

    for (const outcome of outcomes) {
      if (outcome.kind === "skip") {
        if (outcome.reason === "changed") markChanged(outcome.occurrence);
        else skipped++;
        continue;
      }
      const o = outcome.occurrence;
      if (outcome.kind === "replace") {
        if (await this.deps.workShifts.hasAttendance(command.organizationId, outcome.existingShiftId)) {
          markChanged(o);
          continue;
        }
        const previous = plan.existingById.get(outcome.existingShiftId);
        await this.deps.workShifts.delete(command.organizationId, outcome.existingShiftId);
        await this.auditLog.record({
          organizationId: command.organizationId,
          actor: command.actor,
          entityType: "work_shift",
          entityId: outcome.existingShiftId,
          employeeId: o.employeeId,
          action: "deleted",
          description: `Turno de ${o.workDate} substituído pelo modelo "${plan.template.name}"`,
          ...(previous && { before: previous.toProps() }),
          correlationId,
        });
        replaced++;
      } else {
        created++;
      }
      const first = o.segments[0]!;
      await this.deps.workShifts.create(
        command.organizationId,
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
          source: "template",
          templateId: plan.template.id,
        }),
      );
    }

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "shift_template",
      entityId: plan.template.id,
      action: "applied",
      description: `Modelo "${plan.template.name}" aplicado: ${created} turno(s) criado(s), ${replaced} substituído(s), ${skipped} ignorado(s)${
        changed.length > 0 ? `, ${changed.length} alterado(s) desde a pré-visualização (não aplicados)` : ""
      }`,
      after: { audience: command.audience, days: command.days, locationId: command.locationId },
      correlationId,
    });

    return { created, replaced, skipped, changed };
  }
}
