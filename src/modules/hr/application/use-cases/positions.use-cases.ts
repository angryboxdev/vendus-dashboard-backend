import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { Position } from "../../domain/entities/position.js";
import { DuplicatePositionNameError, PositionNotFoundError } from "../../domain/errors.js";
import type {
  CreatePositionCommand,
  CreatePositionPort,
  ListPositionsPort,
  PositionDTO,
  SetPositionActiveCommand,
  SetPositionActivePort,
  UpdatePositionCommand,
  UpdatePositionPort,
} from "../../domain/ports/in/position.ports.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { PositionRepositoryPort } from "../../domain/ports/out/position-repository.port.js";

type Clock = () => Date;
const systemClock: Clock = () => new Date();

function toPositionDTO(position: Position, employeeCount: number): PositionDTO {
  const p = position.toProps();
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    active: p.active,
    employeeCount,
    updatedAt: p.updatedAt,
  };
}

async function activeEmployeeCountByPosition(
  employees: EmployeeRepositoryPort,
  organizationId: OrganizationId,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const e of await employees.findMany(organizationId, { status: "active" })) {
    if (e.positionId) counts.set(e.positionId, (counts.get(e.positionId) ?? 0) + 1);
  }
  return counts;
}

/** Verificação antecipada com a mesma normalização da BD — a restrição única continua a ser a garantia final. */
async function assertNameAvailable(
  positions: PositionRepositoryPort,
  organizationId: OrganizationId,
  candidate: Position,
): Promise<void> {
  const clash = (await positions.findAll(organizationId)).find(
    (p) => p.id !== candidate.id && p.normalizedName === candidate.normalizedName,
  );
  if (clash) throw new DuplicatePositionNameError(clash.name);
}

async function loadOrThrow(positions: PositionRepositoryPort, organizationId: OrganizationId, id: string): Promise<Position> {
  const position = await positions.findById(organizationId, id);
  if (!position) throw new PositionNotFoundError(id);
  return position;
}

export class ListPositionsUseCase implements ListPositionsPort {
  constructor(
    private readonly positions: PositionRepositoryPort,
    private readonly employees: EmployeeRepositoryPort,
  ) {}

  async execute(organizationId: OrganizationId): Promise<PositionDTO[]> {
    const [all, counts] = await Promise.all([
      this.positions.findAll(organizationId),
      activeEmployeeCountByPosition(this.employees, organizationId),
    ]);
    return all
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt"))
      .map((p) => toPositionDTO(p, counts.get(p.id) ?? 0));
  }
}

export class CreatePositionUseCase implements CreatePositionPort {
  constructor(
    private readonly positions: PositionRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly now: Clock = systemClock,
    private readonly newId: () => string = randomUUID,
  ) {}

  async execute(command: CreatePositionCommand): Promise<PositionDTO> {
    const position = Position.create(
      this.newId(),
      { name: command.name, description: command.description },
      this.now(),
    );
    await assertNameAvailable(this.positions, command.organizationId, position);
    await this.positions.insert(command.organizationId, position);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "position",
      entityId: position.id,
      action: "position_created",
      description: `Cargo ${position.name} criado`,
      after: position.toProps(),
      correlationId: randomUUID(),
    });
    return toPositionDTO(position, 0);
  }
}

export class UpdatePositionUseCase implements UpdatePositionPort {
  constructor(
    private readonly positions: PositionRepositoryPort,
    private readonly employees: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly now: Clock = systemClock,
  ) {}

  async execute(command: UpdatePositionCommand): Promise<PositionDTO> {
    const current = await loadOrThrow(this.positions, command.organizationId, command.id);
    const updated = current.update(
      {
        ...(command.name !== undefined && { name: command.name }),
        ...(command.description !== undefined && { description: command.description }),
      },
      this.now(),
    );
    await assertNameAvailable(this.positions, command.organizationId, updated);
    await this.positions.update(command.organizationId, updated);

    const holders = (await this.employees.findMany(command.organizationId, { status: "all" })).filter(
      (e) => e.positionId === updated.id,
    );

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "position",
      entityId: updated.id,
      action: "position_updated",
      description: `Cargo ${updated.name} atualizado`,
      before: current.toProps(),
      after: updated.toProps(),
      correlationId: randomUUID(),
    });
    return toPositionDTO(updated, holders.filter((e) => e.status === "active").length);
  }
}

export class SetPositionActiveUseCase implements SetPositionActivePort {
  constructor(
    private readonly positions: PositionRepositoryPort,
    private readonly employees: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly now: Clock = systemClock,
  ) {}

  async execute(command: SetPositionActiveCommand): Promise<PositionDTO> {
    const current = await loadOrThrow(this.positions, command.organizationId, command.id);
    const counts = await activeEmployeeCountByPosition(this.employees, command.organizationId);
    if (current.active === command.active) return toPositionDTO(current, counts.get(current.id) ?? 0);

    const updated = current.setActive(command.active, this.now());
    await this.positions.update(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "position",
      entityId: updated.id,
      action: command.active ? "position_activated" : "position_deactivated",
      description: `Cargo ${updated.name} ${command.active ? "ativado" : "inativado"}`,
      before: { active: current.active },
      after: { active: updated.active },
      correlationId: randomUUID(),
    });
    return toPositionDTO(updated, counts.get(updated.id) ?? 0);
  }
}
