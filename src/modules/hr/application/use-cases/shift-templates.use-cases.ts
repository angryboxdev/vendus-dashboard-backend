import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import { ShiftTemplate, type ShiftTemplateDetails } from "../../domain/entities/shift-template.js";
import {
  DuplicateShiftTemplateNameError,
  InvalidShiftTemplateError,
  ShiftTemplateNotFoundError,
} from "../../domain/errors.js";
import type {
  CreateShiftTemplateCommand,
  CreateShiftTemplatePort,
  ListShiftTemplatesPort,
  SetShiftTemplateActiveCommand,
  SetShiftTemplateActivePort,
  ShiftTemplateDTO,
  UpdateShiftTemplateCommand,
  UpdateShiftTemplatePort,
} from "../../domain/ports/in/shift-template.ports.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { ShiftTemplateRepositoryPort } from "../../domain/ports/out/shift-template-repository.port.js";

type Clock = () => Date;
const systemClock: Clock = () => new Date();

export function toShiftTemplateDTO(template: ShiftTemplate): ShiftTemplateDTO {
  const p = template.toProps();
  return {
    id: p.id,
    name: p.name,
    group: p.group,
    description: p.description,
    color: p.color,
    kind: template.kind,
    startTime: p.startTime,
    endTime: p.endTime,
    endsNextDay: p.endsNextDay,
    secondStartTime: p.secondStartTime,
    secondEndTime: p.secondEndTime,
    breakMinutes: p.breakMinutes,
    workMinutes: template.workMinutes(),
    spanMinutes: template.spanMinutes(),
    locationId: p.locationId,
    active: p.active,
    updatedAt: p.updatedAt,
  };
}

function pickDetails(input: Partial<ShiftTemplateDetails>): Partial<ShiftTemplateDetails> {
  const out: Partial<ShiftTemplateDetails> = {};
  for (const key of [
    "name",
    "group",
    "description",
    "color",
    "startTime",
    "endTime",
    "endsNextDay",
    "secondStartTime",
    "secondEndTime",
    "breakMinutes",
    "locationId",
  ] as const) {
    if (input[key] !== undefined) (out as Record<string, unknown>)[key] = input[key];
  }
  return out;
}

async function assertNameAvailable(templates: ShiftTemplateRepositoryPort, organizationId: OrganizationId, candidate: ShiftTemplate): Promise<void> {
  const clash = (await templates.findAll(organizationId)).find((t) => t.id !== candidate.id && t.normalizedName === candidate.normalizedName);
  if (clash) throw new DuplicateShiftTemplateNameError(clash.name);
}

/** Local padrão: tem de ser um Local ativo da organização (a FK composta garante a organização; o estado é regra da aplicação). */
async function assertLocation(locations: LocationRepositoryPort, organizationId: OrganizationId, locationId: string | null): Promise<void> {
  if (locationId === null) return;
  const location = await locations.findOneForOrganization(organizationId, locationId);
  if (!location) throw new InvalidShiftTemplateError("Local padrão inexistente");
  if (!location.isActive) throw new InvalidShiftTemplateError(`O local "${location.name}" está inativo`);
}

async function loadOrThrow(templates: ShiftTemplateRepositoryPort, organizationId: OrganizationId, id: string): Promise<ShiftTemplate> {
  const template = await templates.findById(organizationId, id);
  if (!template) throw new ShiftTemplateNotFoundError(id);
  return template;
}

export class ListShiftTemplatesUseCase implements ListShiftTemplatesPort {
  constructor(private readonly templates: ShiftTemplateRepositoryPort) {}

  async execute(organizationId: OrganizationId): Promise<ShiftTemplateDTO[]> {
    return (await this.templates.findAll(organizationId))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt"))
      .map(toShiftTemplateDTO);
  }
}

export class CreateShiftTemplateUseCase implements CreateShiftTemplatePort {
  constructor(
    private readonly templates: ShiftTemplateRepositoryPort,
    private readonly locations: LocationRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(command: CreateShiftTemplateCommand): Promise<ShiftTemplateDTO> {
    const { organizationId, actor, ...input } = command;
    const template = ShiftTemplate.create(randomUUID(), input, actor, this.clock());
    await assertNameAvailable(this.templates, organizationId, template);
    await assertLocation(this.locations, organizationId, template.locationId);
    await this.templates.insert(organizationId, template);
    await this.auditLog.record({
      organizationId,
      actor,
      entityType: "shift_template",
      entityId: template.id,
      action: "created",
      description: `Modelo de turno "${template.name}" criado`,
      after: template.toProps(),
      correlationId: randomUUID(),
    });
    return toShiftTemplateDTO(template);
  }
}

export class UpdateShiftTemplateUseCase implements UpdateShiftTemplatePort {
  constructor(
    private readonly templates: ShiftTemplateRepositoryPort,
    private readonly locations: LocationRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(command: UpdateShiftTemplateCommand): Promise<ShiftTemplateDTO> {
    const { organizationId, actor, id, ...input } = command;
    const before = await loadOrThrow(this.templates, organizationId, id);
    const after = before.update(pickDetails(input), this.clock());
    await assertNameAvailable(this.templates, organizationId, after);
    if (after.locationId !== before.locationId) await assertLocation(this.locations, organizationId, after.locationId);
    await this.templates.update(organizationId, after);
    await this.auditLog.record({
      organizationId,
      actor,
      entityType: "shift_template",
      entityId: id,
      action: "updated",
      description: `Modelo de turno "${after.name}" alterado (só afeta utilizações futuras)`,
      before: before.toProps(),
      after: after.toProps(),
      correlationId: randomUUID(),
    });
    return toShiftTemplateDTO(after);
  }
}

export class SetShiftTemplateActiveUseCase implements SetShiftTemplateActivePort {
  constructor(
    private readonly templates: ShiftTemplateRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly clock: Clock = systemClock,
  ) {}

  async execute(command: SetShiftTemplateActiveCommand): Promise<ShiftTemplateDTO> {
    const before = await loadOrThrow(this.templates, command.organizationId, command.id);
    if (before.active === command.active) return toShiftTemplateDTO(before);
    const after = before.setActive(command.active, this.clock());
    await this.templates.update(command.organizationId, after);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "shift_template",
      entityId: command.id,
      action: command.active ? "activated" : "deactivated",
      description: `Modelo de turno "${after.name}" ${command.active ? "ativado" : "inativado"}`,
      before: before.toProps(),
      after: after.toProps(),
      correlationId: randomUUID(),
    });
    return toShiftTemplateDTO(after);
  }
}
