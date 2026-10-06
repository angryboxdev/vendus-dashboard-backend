import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { WorkShift, ShiftStatus } from "../../entities/work-shift.js";

export type ShiftAttendanceStatusValue = "worked_as_planned" | "late" | "left_early" | "cancelled";

export interface WorkShiftFilter {
  from: string;
  to: string;
  employeeId?: string;
  locationId?: string;
  status?: ShiftStatus;
}

export interface WorkShiftRepositoryPort {
  findInRange(organizationId: OrganizationId, filter: WorkShiftFilter): Promise<WorkShift[]>;
  findById(organizationId: OrganizationId, id: string): Promise<WorkShift | null>;
  create(organizationId: OrganizationId, shift: WorkShift): Promise<WorkShift>;
  update(organizationId: OrganizationId, shift: WorkShift): Promise<WorkShift>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
  /** Apaga vários turnos de uma vez (limpeza em massa). Não verifica presenças — quem chama já filtrou. */
  deleteMany(organizationId: OrganizationId, ids: string[]): Promise<void>;
  /** Turno já tem presença registada (`hr_shift_attendance`)? Bloqueia remoção direta — ver `WorkShiftHasAttendanceError`. */
  hasAttendance(organizationId: OrganizationId, shiftId: string): Promise<boolean>;
  /** Estado de presença já registado por turno (para a bolinha "Pendente"/"Conferido" do calendário) — consulta própria, independente de `ShiftAttendanceReadPort` (RH-01), que serve um propósito diferente (fila de revisão). */
  findAttendanceStatusesByShiftIds(
    organizationId: OrganizationId,
    shiftIds: string[],
  ): Promise<Map<string, ShiftAttendanceStatusValue>>;
  /** Todos os turnos de uma série recorrente (edição/limpeza em lote — "Este e os seguintes"/"Toda a série"). */
  findBySeriesId(organizationId: OrganizationId, seriesId: string): Promise<WorkShift[]>;
}
