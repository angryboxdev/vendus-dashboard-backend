import type { DeliveryTotals } from "../out/air-menu-delivery-gateway.port.js";

/**
 * Port de entrada: consulta os totais AirMenu para uma data, sem submeter fecho.
 * Usado pelo kiosk no step de revisão (pré-submissão) para mostrar referência AirMenu.
 * Devolve null se o gateway AirMenu não estiver configurado ou falhar.
 */
export interface GetAirMenuTotalsPort {
  execute(date: string): Promise<DeliveryTotals | null>;
}
