/**
 * Caixa de pedidos do Novo RH (FE-050): todos os pedidos que a gestão decide —
 * ausências, correções de ponto, excedente de horas, trocas de turno e
 * solicitações personalizadas — num só sítio. Não guarda nada: cada tipo
 * continua no seu módulo, com as suas regras (sem autoaprovação, nível atual,
 * período fechado).
 */

export type InboxType = "leave" | "clock" | "overtime" | "swap" | "custom";
export const INBOX_TYPES: InboxType[] = ["leave", "clock", "overtime", "swap", "custom"];

/** Porque é que o utilizador não pode decidir (null = pode). */
export type BlockedReason = "own" | "not_current_level" | "no_permission";

/** Um pedido, tal como a fonte do seu tipo o descreve. */
export interface InboxItem {
  type: InboxType;
  id: string;
  employeeId: string;
  requestedAt: string;
  /** Ex.: "Férias", "Correção de ponto". */
  title: string;
  /** Linha de resumo (datas, horas). */
  detail: string;
  /** Campos extra para o detalhe (já formatados, sem dados privados). */
  meta: { label: string; value: string }[];
  blockedReason: BlockedReason | null;
  /** Fluxos multinível: nível atual (1…) de N. */
  level: { current: number; total: number } | null;
}

export interface InboxRow extends InboxItem {
  key: string;
  employeeName: string;
  locationName: string | null;
  ageDays: number;
  canDecide: boolean;
}

export type InboxSegment = "mine" | "others" | "all";
export type InboxDecision = "approve" | "reject";

export interface DecisionResult {
  key: string;
  ok: boolean;
  code?: string;
  message?: string;
}

/** Recusa exige motivo (comunicado ao requerente). */
export const MIN_REJECT_REASON = 5;
/** Máximo de pedidos por decisão em lote. */
export const MAX_BATCH = 50;

export const itemKey = (type: InboxType, id: string) => `${type}:${id}`;
