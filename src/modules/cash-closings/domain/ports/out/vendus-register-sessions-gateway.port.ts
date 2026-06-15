import type { RegisterSession } from "../../entities/register-session.js";

/**
 * Gateway para consultar sessões de caixa no Vendus via /registers/{id}/movements/.
 * A implementação concreta conhece o registerId; o domínio não.
 */
export interface VendusRegisterSessionsGatewayPort {
  /**
   * Devolve todas as sessões (completas ou em aberto) para a data indicada.
   * Cada sessão inclui o total calculado a partir dos movimentos "in".
   */
  getSessionsForDate(date: string): Promise<RegisterSession[]>;

  /**
   * Recalcula o total de uma sessão específica no momento do submit.
   * Mais preciso que o total de getSessionsForDate porque inclui
   * movimentos ocorridos após a listagem inicial.
   */
  getSessionTotal(date: string, sessionOpenedAt: string): Promise<number>;
}
