/**
 * Value object que representa uma sessão de caixa no Vendus.
 * Uma sessão começa com um movimento "open" e termina com "close".
 * Se ainda não foi fechada, closedAt é null.
 */
export interface RegisterSession {
  /** ISO datetime da abertura, ex: "2026-06-07T11:16:15" */
  openedAt: string;
  /** ISO datetime do fecho. null se a sessão ainda está aberta. */
  closedAt: string | null;
  /** Soma de todos os movimentos operation="in" dentro desta janela. */
  total: number;
}
