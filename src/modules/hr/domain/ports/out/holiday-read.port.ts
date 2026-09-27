import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface PublicHoliday {
  date: string;
  name: string;
}

/**
 * Lê `hr_public_holidays` (módulo legacy, gerido hoje só por
 * `src/routes/hrLeaveRoutes.ts`) diretamente — padrão D10, mesma disciplina
 * já usada por `LeaveReadPort`/`ShiftAttendanceReadPort`. Só leitura: a
 * gestão do calendário de feriados continua no legacy.
 */
export interface HolidayReadPort {
  findInRange(organizationId: OrganizationId, from: string, to: string): Promise<PublicHoliday[]>;
}
