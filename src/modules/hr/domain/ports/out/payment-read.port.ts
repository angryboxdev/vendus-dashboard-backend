import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Lê `hr_employee_payments` (módulo legacy) diretamente — padrão D10.
 * `isPaid=false` é o único sinal de "pendente" que existe hoje (não há
 * conceito de período fechado) — decisão confirmada com o utilizador:
 * conta todos os registos por pagar, sem filtro de período.
 */
export interface PaymentReadPort {
  countUnpaid(organizationId: OrganizationId): Promise<number>;
}
