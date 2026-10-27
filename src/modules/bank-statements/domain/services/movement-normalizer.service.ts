import type { MovementType } from "../entities/bank-movement.js";

/**
 * Tipo do movimento (task «Conciliação bancária V2», §9). Não confundir com `movementType`
 * (débito/crédito): é a natureza do movimento, para ler o extrato e filtrar.
 */
export type MovementKind =
  | "sales"
  | "deposit"
  | "transfer_in"
  | "transfer_out"
  | "supplier"
  | "payroll"
  | "tax_state"
  | "bank_fee"
  | "insurance"
  | "utilities"
  | "card_purchase"
  | "internal_transfer"
  | "reversal"
  | "to_review";

/** Plataforma de entrega que fez a liquidação (só em créditos de vendas). */
export type DeliveryPlatform = "uber_eats" | "glovo" | "bolt_food";

/** Venda do restaurante que entra no banco: «card» = liquidação do TPA, «cash» = depósito. */
export type RestaurantSaleChannel = "card" | "cash";

export interface NormalizedMovement {
  normalizedDescription: string;
  kind: MovementKind;
  /** Liquidação de uma plataforma de entrega (já sem a comissão da plataforma). */
  platform?: DeliveryPlatform;
  /** Venda do restaurante (TPA ou depósito) — para conferir com o Vendus. */
  restaurantSale?: RestaurantSaleChannel;
}

const UTILITIES = /\b(EDP|GALP|ENDESA|IBERDROLA|GOLD ?ENERGY|GOLDENERGY|AGUAS|ÁGUAS|EPAL|INDAQUA|SMAS|NOS|MEO|VODAFONE|NOWO|DIGI)\b/i;
const INSURANCE = /\b(GENERALI|FIDELIDADE|ALLIANZ|AGEAS|TRANQUILIDADE|OCIDENTAL|ZURICH|MAPFRE|LIBERTY|LUSITANIA|CA SEGUROS|SEGUROS?)\b/i;
const STATE = /\b(PAG\.?\s?DUC|PAG\.?\s?IGCP|AUTORIDADE TRIBUTARIA|SEG(URANCA)? SOCIAL|TAXA SOCIAL UNICA|INSTITUTO (DE )?GESTAO|INSTITUTO (DOS )?REGISTOS|IGFSS|FINANCAS|PORTAL DAS FINANCAS)\b/i;
/** Entradas de vendas por contraparte (nomes decididos pelo utilizador, 2026-10-27). */
const SALES_PLATFORMS: [RegExp, string, DeliveryPlatform | null, RestaurantSaleChannel?][] = [
  [/UBER\s+PAYMENTS|STICHTING CUSTODIAN UBER/i, "Venda plataforma Uber", "uber_eats"],
  [/\bBOLT OPERATIONS\b/i, "Venda plataforma Bolt", "bolt_food"],
  [/^STRIPE\b/i, "Recebimento Stripe", null],
  [/\bGLOVO(APP)?\b/i, "Venda plataforma Glovo", "glovo"],
  [/\bUNICRE\b/i, "Venda restaurante cartão (Unicre)", null, "card"],
];

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** Tira referências numéricas, valores («50.15EUR») e códigos do fim da descrição. */
function counterpart(rest: string): string {
  const words = squash(rest).split(" ");
  const kept = words.filter((w) => !/\d/.test(w) || /^[A-Za-z]+\d?[A-Za-z]+$/.test(w));
  return squash(kept.join(" ").replace(/\b\d+[.,]\d{2}(EUR|USD|GBP)\b/gi, "").replace(/[*-]+$/g, ""));
}
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (_m, sp: string, c: string) => sp + c.toUpperCase());

/**
 * Descrição legível e tipo do movimento a partir do descritivo do banco — por regras (camada 3 da
 * task), nunca por IA. Calculado na leitura, por isso vale também para os movimentos já importados e
 * melhora com as regras sem precisar de migração. Sem regra: «Por rever», com a descrição limpa.
 */
export function normalizeMovement(description: string, type: MovementType): NormalizedMovement {
  const d = squash(description);
  const up = d.toUpperCase();

  // ── Devoluções / estornos (antes de tudo: «DEVOL PAG SERV» não é um pagamento) ──
  if (type === "credit" && /^DEV\.?\s?TRF/.test(up)) return { normalizedDescription: "Devolução de transferência", kind: "reversal" };
  if (type === "credit" && /^(OPDE\s+)?DEVOL\b|^REVER\b|\bESTORNO\b|^ANUL/.test(up)) {
    if (/^OPDE\s+DEVOL\s+COM/.test(up)) return { normalizedDescription: "Devolução de comissão bancária", kind: "reversal" };
    if (/^REVER\b/.test(up)) return { normalizedDescription: `Reversão de débito direto — ${titleCase(counterpart(d.replace(/^REVER\s+\S+\s*/i, "")))}`, kind: "reversal" };
    return { normalizedDescription: `Devolução — ${titleCase(counterpart(d.replace(/^(OPDE\s+)?DEVOL\s*/i, "")))}`, kind: "reversal" };
  }

  // ── Entradas ──
  if (type === "credit") {
    const tpa = /^CREDITO TPA\b.*?(\d{5,})/.exec(up);
    if (tpa || /^CREDITO TPA\b/.test(up)) {
      return { normalizedDescription: tpa ? `Venda restaurante cartão (terminal ${tpa[1]})` : "Venda restaurante cartão", kind: "sales", restaurantSale: "card" };
    }
    for (const [re, name, platform, restaurantSale] of SALES_PLATFORMS) {
      if (re.test(d)) return { normalizedDescription: name, kind: "sales", ...(platform ? { platform } : {}), ...(restaurantSale ? { restaurantSale } : {}) };
    }
    // Todos os depósitos contam como venda do restaurante em dinheiro (decisão do utilizador, 2026-10-27)
    if (/^DEP(OSITO)?\b/.test(up)) {
      return { normalizedDescription: /\bNUM/.test(up) ? "Venda restaurante dinheiro (depósito em numerário)" : "Venda restaurante dinheiro (depósito)", kind: "deposit", restaurantSale: "cash" };
    }
    if (/^TRF\.?\s*(DE|P\/O)\b/.test(up)) return { normalizedDescription: `Transferência de ${titleCase(counterpart(d.replace(/^TRF\.?\s*(DE|P\/O)\s*/i, "")))}`, kind: "transfer_in" };
    return { normalizedDescription: titleCase(counterpart(d)), kind: "to_review" };
  }

  // ── Saídas ──
  if (/^COM\.?\s?MAN\.?\s?CONTA/.test(up)) return { normalizedDescription: "Comissão de manutenção de conta", kind: "bank_fee" };
  if (/^IMPOSTO\s+(DO\s+)?SELO/.test(up)) return { normalizedDescription: "Imposto do selo", kind: "bank_fee" };
  if (/^MENSAL\.?\s+FICH\.?\s+FECHOS/.test(up)) return { normalizedDescription: "Mensalidade do terminal TPA", kind: "bank_fee" };
  if (/^TARIFA\b/.test(up)) return { normalizedDescription: "Tarifa bancária", kind: "bank_fee" };
  if (/^(CUSTO DE SERVICO|COMISS(AO|ÃO)|COM\.)/.test(up)) return { normalizedDescription: "Comissões e serviços bancários", kind: "bank_fee" };
  if (/^PAGAMENTO VENCIMENTOS\b/.test(up)) return { normalizedDescription: "Pagamento de vencimentos", kind: "payroll" };
  if (/^BUS PAGAMENTO CARTAO\b/.test(up)) return { normalizedDescription: "Pagamento do cartão de crédito", kind: "internal_transfer" };
  if (STATE.test(up)) {
    if (/PAG\.?\s?DUC/.test(up)) return { normalizedDescription: "Pagamento ao Estado (DUC)", kind: "tax_state" };
    if (/PAG\.?\s?IGCP/.test(up)) return { normalizedDescription: "Pagamento ao Estado (IGCP)", kind: "tax_state" };
    if (/TAXA SOCIAL UNICA/.test(up)) return { normalizedDescription: "Segurança Social (TSU)", kind: "tax_state" };
    return { normalizedDescription: `Pagamento ao Estado — ${titleCase(counterpart(d.replace(/^PAG\s?SERV\s*/i, "")))}`, kind: "tax_state" };
  }
  if (/^DD\b/.test(up)) {
    const who = titleCase(counterpart(d.replace(/^DD\s*/i, "")));
    return { normalizedDescription: `Débito direto — ${who}`, kind: INSURANCE.test(up) ? "insurance" : UTILITIES.test(up) ? "utilities" : "supplier" };
  }
  if (/^PAG\s?SERV\b|^PAGSERV\b/.test(up)) {
    const who = titleCase(counterpart(d.replace(/^PAG\s?SERV\s*/i, "")));
    return { normalizedDescription: `Pagamento de serviço — ${who || "referência"}`, kind: INSURANCE.test(up) ? "insurance" : UTILITIES.test(up) ? "utilities" : "supplier" };
  }
  if (/^TRF\.?\s*(P\/|P\/O)\s*/.test(up)) return { normalizedDescription: `Transferência para ${titleCase(counterpart(d.replace(/^TRF\.?\s*P\/O?\s*/i, "")))}`, kind: "transfer_out" };
  if (/^LEV\.?\s+NUM\b/.test(up)) return { normalizedDescription: "Levantamento em numerário", kind: "internal_transfer" };
  // Compra com cartão: online («MDB…») ou em loja — no Millennium, transferências e pagamentos têm
  // sempre prefixo (TRF, DD, PAGSERV…), por isso um débito sem prefixo conhecido é uma compra em loja.
  const merchant = counterpart(d.replace(/^MDB\d*\s*/i, "")).replace(/^WWW\./i, "").replace(/\*+/g, " ");
  return { normalizedDescription: `Compra com cartão — ${titleCase(squash(merchant)) || "comerciante"}`, kind: "card_purchase" };
}

/** Campos do DTO de um movimento (descrição normalizada + tipo). */
export function normalizedFields(m: { description: string; movementType: MovementType }): { normalizedDescription: string; movementKind: MovementKind } {
  const n = normalizeMovement(m.description, m.movementType);
  return { normalizedDescription: n.normalizedDescription, movementKind: n.kind };
}
