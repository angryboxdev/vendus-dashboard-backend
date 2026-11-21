import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DateRange, IsoDate, SalesBucket, SalesSource } from "../../entities/sales-analysis.js";

/** Vendas da Vendus (loja principal) num intervalo, já em blocos por hora de Lisboa. */
export interface VendusSalesSourcePort {
  fetchBuckets(range: DateRange): Promise<SalesBucket[]>;
}

/** Vendas da AirMenu (loja principal) num intervalo de no máximo um mês. */
export interface AirMenuSalesSourcePort {
  fetchBuckets(range: DateRange): Promise<SalesBucket[]>;
}

/**
 * Blocos guardados de dias fechados. Um dia «coberto» foi guardado por inteiro
 * (mesmo que sem vendas) e nunca mais é pedido à fonte.
 */
export interface SalesBucketStorePort {
  coveredDays(organizationId: OrganizationId, source: SalesSource, range: DateRange): Promise<Set<IsoDate>>;
  buckets(organizationId: OrganizationId, source: SalesSource, range: DateRange): Promise<SalesBucket[]>;
  /** Substitui os blocos dos `days` indicados e marca-os como cobertos. */
  saveDays(organizationId: OrganizationId, source: SalesSource, days: IsoDate[], buckets: SalesBucket[]): Promise<void>;
}

/** Modelo de IA de texto. Devolve o texto da resposta, ou null se indisponível/falhou. */
export interface ForecastModelPort {
  readonly available: boolean;
  complete(prompt: string): Promise<string | null>;
}

/** Data e hora atuais em Lisboa. */
export interface ClockPort {
  today(): IsoDate;
  /** Hora atual (0–23) em Lisboa. */
  hour(): number;
}
