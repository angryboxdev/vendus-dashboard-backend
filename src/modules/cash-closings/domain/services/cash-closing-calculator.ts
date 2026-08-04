export interface ChannelAmounts {
  tpa: number;
  uber: number;
  glovo: number;
  bolt: number;
  eatz: number;
  cashSales: number;
}

/**
 * Serviço de domínio puro: cálculos derivados de um fecho de caixa.
 * Sem dependências externas — testável com dados simples.
 */
export class CashClosingCalculator {
  /**
   * Total de vendas calculado: soma de todos os canais de pagamento.
   * Arredondado a 2 casas decimais para evitar flutuação de vírgula.
   */
  static computeTotal(channels: ChannelAmounts): number {
    const raw =
      channels.tpa +
      channels.uber +
      channels.glovo +
      channels.bolt +
      channels.eatz +
      channels.cashSales;
    return Math.round(raw * 100) / 100;
  }

  /**
   * Sub-total dos canais faturados no Vendus (canal próprio): TPA + Eatz + Dinheiro.
   * Arredondado a 2 casas decimais.
   */
  static computeVendusSubtotal(channels: Pick<ChannelAmounts, "tpa" | "eatz" | "cashSales">): number {
    const raw = channels.tpa + channels.eatz + channels.cashSales;
    return Math.round(raw * 100) / 100;
  }

  /**
   * Sub-total dos canais faturados no AirMenu (delivery externo): Uber + Glovo + Bolt.
   * Arredondado a 2 casas decimais.
   */
  static computeAirMenuSubtotal(channels: Pick<ChannelAmounts, "uber" | "glovo" | "bolt">): number {
    const raw = channels.uber + channels.glovo + channels.bolt;
    return Math.round(raw * 100) / 100;
  }

  /**
   * Sangria: valor a retirar da gaveta para a manter com fundo de 100 €.
   * Se a gaveta ficar igual ou abaixo de 100 €, sangria = 0.
   */
  static computeSangria(cashDrawerTotal: number): number {
    if (cashDrawerTotal <= 100) return 0;
    return Math.round((cashDrawerTotal - 100) * 100) / 100;
  }
}
