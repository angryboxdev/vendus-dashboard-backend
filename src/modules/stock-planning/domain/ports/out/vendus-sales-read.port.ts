import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DemandActualRow } from "./demand-actuals-repository.port.js";

/**
 * Lê vendas reais por dia por fonte de procura, reutilizando
 * `buildMonthlySummary`/`fetchAllDocuments` (`src/services/
 * monthlySummaryService.ts`/`documentsService.ts`) — exceção deliberada e
 * documentada à regra "nunca importar serviço legacy" (ver README).
 *
 * **Risco de performance conhecido** (ver README "Design decisions"):
 * `fetchAllDocuments` não tem granularidade diária nativa — agrega
 * `since..until` num único total. Para obter um ponto por dia, este
 * adapter chama-o uma vez por dia (`since=until=dia`), cada chamada fazendo
 * 1 pedido de listagem + 1 pedido de detalhe por documento FS/FT/NC real à
 * API da Vendus. Um backfill de ~90 dias é, portanto, ~90 chamadas
 * sequenciais a este método, cada uma proporcional ao volume de documentos
 * desse dia — pode demorar minutos a dezenas de minutos consoante o
 * volume. É prático, mas não instantâneo; documentado como o maior risco
 * conhecido desta ronda.
 */
export interface VendusSalesReadPort {
  /** Um dia civil; devolve uma linha por fonte de procura com venda nesse dia (nunca inventa dias sem venda). */
  fetchDailyActuals(organizationId: OrganizationId, locationId: string, date: string): Promise<DemandActualRow[]>;
}
