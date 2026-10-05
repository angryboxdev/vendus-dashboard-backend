import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ShiftKind } from "../../entities/work-shift.js";

export interface ShiftTemplateDTO {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  kind: ShiftKind;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  secondStartTime: string | null;
  secondEndTime: string | null;
  breakMinutes: number;
  /** Tempo de trabalho (períodos − pausa), em minutos. */
  workMinutes: number;
  /** Do início do 1.º período ao fim do último, em minutos. */
  spanMinutes: number;
  locationId: string | null;
  active: boolean;
  updatedAt: string;
}

export interface ShiftTemplateInput {
  name: string;
  description: string | null;
  color: string | null;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  secondStartTime: string | null;
  secondEndTime: string | null;
  breakMinutes: number;
  locationId: string | null;
}

/** Ativos primeiro, depois por nome. */
export interface ListShiftTemplatesPort {
  execute(organizationId: OrganizationId): Promise<ShiftTemplateDTO[]>;
}

export interface CreateShiftTemplateCommand extends ShiftTemplateInput {
  organizationId: OrganizationId;
  actor: string;
}

export interface CreateShiftTemplatePort {
  execute(command: CreateShiftTemplateCommand): Promise<ShiftTemplateDTO>;
}

export interface UpdateShiftTemplateCommand extends Partial<ShiftTemplateInput> {
  organizationId: OrganizationId;
  actor: string;
  id: string;
}

/** Afeta só utilizações futuras — nunca toca turnos já criados (RH 2.0 §1). */
export interface UpdateShiftTemplatePort {
  execute(command: UpdateShiftTemplateCommand): Promise<ShiftTemplateDTO>;
}

export interface SetShiftTemplateActiveCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  active: boolean;
}

/** Ativar/inativar — nunca há hard delete. */
export interface SetShiftTemplateActivePort {
  execute(command: SetShiftTemplateActiveCommand): Promise<ShiftTemplateDTO>;
}
