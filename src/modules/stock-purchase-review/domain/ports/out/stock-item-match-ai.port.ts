export interface StockItemMatchAiLine {
  index: number;
  description: string;
  purchaseUnit: string;
  /** Só estes artigos podem ser escolhidos para esta linha (pré-seleção por nome + catálogo pequeno). */
  candidates: { id: string; name: string; baseUnit: string }[];
}

export interface StockItemMatchAiResult {
  index: number;
  /** `existing_item` com um dos candidatos, `no_stock_effect` (serviço, equipamento, taxa…) ou null (sem certeza). */
  resolution: "existing_item" | "no_stock_effect" | null;
  stockItemId: string | null;
  /** Unidades base por unidade de compra, se a descrição o permitir. */
  conversionFactor: number | null;
  /** 0..1 */
  confidence: number;
}

/**
 * Conciliação por IA das linhas que o histórico e o nome não resolveram (F3b). Recebe só
 * descrições e nomes de artigos — sem fornecedor, NIF nem valores. Nunca cria artigos.
 */
export interface StockItemMatchAiPort {
  match(lines: StockItemMatchAiLine[]): Promise<StockItemMatchAiResult[]>;
}
