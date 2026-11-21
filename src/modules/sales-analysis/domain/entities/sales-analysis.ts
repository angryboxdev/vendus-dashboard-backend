/**
 * Análise de Vendas — entidades do domínio.
 *
 * A unidade de dados é o **bloco**: vendas de um dia, numa hora (de Lisboa) e
 * num canal. Tudo o resto (KPIs, dia mais forte, mapa de calor…) calcula-se a
 * partir dos blocos, no frontend.
 */

export type SalesSource = "vendus" | "airmenu";
export type SourceSelection = "vendus" | "airmenu" | "both";

export const VENDUS_CHANNELS = ["salao", "take_away", "eatz", "apps"] as const;
export const AIRMENU_CHANNELS = ["uber_eats", "glovo", "bolt_food"] as const;
export type VendusChannel = (typeof VENDUS_CHANNELS)[number];
export type AirMenuChannel = (typeof AIRMENU_CHANNELS)[number];
export type SalesChannel = VendusChannel | AirMenuChannel;
export const ALL_CHANNELS: readonly SalesChannel[] = [...VENDUS_CHANNELS, ...AIRMENU_CHANNELS];

export function sourceOfChannel(c: SalesChannel): SalesSource {
  return (VENDUS_CHANNELS as readonly string[]).includes(c) ? "vendus" : "airmenu";
}

/** Data de calendário AAAA-MM-DD (Lisboa). */
export type IsoDate = string;

export interface SalesBucket {
  date: IsoDate;
  /** 0–23, hora de Lisboa. */
  hour: number;
  channel: SalesChannel;
  /** Com IVA, já líquido de notas de crédito (pode ser negativo). */
  grossCents: number;
  /** Sem IVA. */
  netCents: number;
  /** Faturas − notas de crédito (cada NC anula uma venda). */
  count: number;
}

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

/** Estado de um mês da AirMenu: guardado, parcial, em falta ou a ser buscado. */
export type AirMenuMonthState = "stored" | "partial" | "missing" | "queued" | "fetching" | "error";

export interface AirMenuMonthStatus {
  month: string; // AAAA-MM
  state: AirMenuMonthState;
  /** Mensagem do último erro (se state = error). */
  error?: string | undefined;
  /** Progresso da busca (state = fetching): dias já guardados / dias a buscar. */
  doneDays?: number | undefined;
  totalDays?: number | undefined;
}

export interface FillProgress {
  running: boolean;
  doneDays: number;
  totalDays: number;
  lastError?: string;
}

/** Resposta do pedido principal. Os blocos vão compactados (ver CompactBucket). */
export interface SalesAnalysisData {
  today: IsoDate;
  source: SourceSelection;
  range: DateRange;
  prevYearRange: DateRange;
  prevMonthRange: DateRange;
  channels: SalesChannel[];
  /** [data, hora, índice do canal, bruto, líquido, n.º vendas] — período escolhido. */
  current: CompactBucket[];
  /** Mesmo formato, só com hora −1 (total do dia por canal) — ano anterior. */
  prevYear: CompactBucket[];
  /** Total do dia por canal — mês anterior. */
  prevMonth: CompactBucket[];
  vendus: {
    /** Dias fechados ainda por guardar (o preenchimento corre em segundo plano). */
    missingDays: number;
    fill: FillProgress | null;
    /** Hoje veio da Vendus em direto? false = falhou. */
    todayLive: boolean | null;
  } | null;
  airMenu: {
    months: AirMenuMonthStatus[];
    /** Meses do ano anterior / mês anterior sem dados guardados (só aviso). */
    comparisonMissingMonths: string[];
  } | null;
}

export type CompactBucket = [IsoDate, number, number, number, number, number];

export function compact(b: SalesBucket, channels: readonly SalesChannel[]): CompactBucket {
  return [b.date, b.hour, channels.indexOf(b.channel), b.grossCents, b.netCents, b.count];
}

// ─── Previsão ────────────────────────────────────────────────────────────────

export interface ForecastDay {
  date: IsoDate;
  expectedCents: number;
  lowCents: number;
  highCents: number;
  expectedCount: number;
}

export interface SalesForecast {
  month: string; // AAAA-MM
  generatedAt: string;
  /** "ai" = modelo de IA; "baseline" = regra simples (IA indisponível ou resposta inválida). */
  method: "ai" | "baseline";
  /** Vendido no mês até ontem (dias fechados), em cêntimos. Hoje entra na previsão. */
  actualCents: number;
  days: ForecastDay[];
  expectedTotalCents: number;
  lowTotalCents: number;
  highTotalCents: number;
  note?: string | undefined;
}

export class SalesAnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesAnalysisValidationError";
  }
}
