export interface AirMenuAnalyticsSummary {
  /** Número de faturas (excluindo notas de crédito). */
  totalOrders: number;
  /** Número de notas de crédito (cancelamentos). */
  totalCancellations: number;
  /** Percentagem de pedidos cancelados (0-100). */
  cancellationRate: number;
  /** Total bruto com IVA incluído (positivo = receita, negativo = reembolso). */
  grossRevenue: number;
  /** Total de IVA contido no grossRevenue. */
  vatCollected: number;
  /** Receita líquida sem IVA. */
  netRevenue: number;
  /** Valor médio por fatura (grossRevenue de faturas / totalOrders). */
  averageTicket: number;
}

export interface PlatformStats {
  platform: string;
  orderCount: number;
  cancellationCount: number;
  grossRevenue: number;
  vatCollected: number;
  netRevenue: number;
  averageTicket: number;
}

export interface SubcategoryStats {
  /** Nome da família AirMenu (ex: "Salties", "Specials"). */
  category: string;
  itemsSold: number;
  grossRevenue: number;
  vatCollected: number;
  netRevenue: number;
}

export interface CategoryStats {
  /** Categoria de negócio (ex: "Pizzas", "Bebidas"). */
  category: string;
  itemsSold: number;
  grossRevenue: number;
  vatCollected: number;
  netRevenue: number;
  /** Detalhe por sub-categoria AirMenu. Vazio quando a categoria não tem sub-grupos. */
  subcategories: SubcategoryStats[];
}

export interface VatRateStats {
  /** Taxa em percentagem inteira: 0, 13, 23. */
  rate: number;
  grossRevenue: number;
  vatAmount: number;
  netRevenue: number;
}

export interface TopItem {
  plu: string;
  title: string;
  category: string;
  /** Taxa em percentagem inteira: 0, 13, 23. */
  vatRate: number;
  quantitySold: number;
  grossRevenue: number;
}

export interface TemporalPoint {
  /** "HH:00" para vista diária ou "YYYY-MM-DD" para vista multi-dia. */
  period: string;
  orderCount: number;
  grossRevenue: number;
}

export interface AirMenuAnalytics {
  summary: AirMenuAnalyticsSummary;
  byPlatform: PlatformStats[];
  byCategory: CategoryStats[];
  byVatRate: VatRateStats[];
  byDocumentType: {
    invoices: { count: number; grossRevenue: number };
    creditNotes: { count: number; grossRevenue: number };
  };
  topItems: TopItem[];
  temporalDistribution: TemporalPoint[];
}
