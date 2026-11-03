import type { Dec } from "../../../../kernel/money/decimal.js";
import { formatAmount } from "./amount-format.js";
import { add } from "./decimal-ops.js";
import type { DocumentTotals } from "./document-totals.service.js";

/**
 * Mensagem do código QR (Portaria 195/2020; «Especificações Técnicas – Código
 * QR», AT, v1.1). Campos `código:valor` unidos por `*`, pela ordem da tabela;
 * montantes em EUR com 2 casas; opcionais só aparecem se houver informação.
 */

export interface QrBaseAndTax {
  base: Dec;
  tax: Dec;
}

/** Um espaço fiscal (I, J ou K): região e bases/IVA por taxa. */
export interface QrFiscalSpace {
  region: string;
  exemptBase?: Dec;
  reduced?: QrBaseAndTax;
  intermediate?: QrBaseAndTax;
  normal?: QrBaseAndTax;
}

export interface QrInput {
  issuerTaxId: string;
  customerTaxId: string;
  customerCountry: string;
  /** InvoiceType / WorkType / MovementType / PaymentType. */
  documentType: string;
  documentStatus: string;
  /** AAAA-MM-DD. */
  documentDate: string;
  documentNumber: string;
  atcud: string;
  /** 0 a 3; vazio = documento sem IVA indicado (I1:0). */
  fiscalSpaces: QrFiscalSpace[];
  notSubjectAmount?: Dec;
  stampDuty?: Dec;
  taxPayable: Dec;
  grossTotal: Dec;
  withholdingTax?: Dec;
  /** 4 caracteres do hash. */
  signatureCode: string;
  certificateNumber: string;
  /** Campo S, ex.: "NU;0.80" ou "TB;IBAN;valor". */
  otherInfo?: string;
}

const MAX_LENGTH: Record<string, number> = { A: 9, B: 30, C: 12, D: 2, E: 1, F: 8, G: 60, H: 70, Q: 4, R: 4, S: 65 };
const AMOUNT_MAX = 16;
const REGION_MAX = 5;

function field(code: string, value: string): string {
  const max = MAX_LENGTH[code] ?? AMOUNT_MAX;
  if (value.length === 0 || value.length > max) throw new Error(`Campo ${code} do QR inválido: "${value}"`);
  if (value.includes("*")) throw new Error(`Campo ${code} do QR não pode conter "*"`);
  return `${code}:${value}`;
}

const amount = (code: string, d: Dec) => field(code, formatAmount(d));

function fiscalSpaceFields(letter: "I" | "J" | "K", space: QrFiscalSpace): string[] {
  if (space.region.length > REGION_MAX) throw new Error(`Espaço fiscal inválido: ${space.region}`);
  const out = [`${letter}1:${space.region}`];
  if (space.exemptBase) out.push(amount(`${letter}2`, space.exemptBase));
  const rates: [QrBaseAndTax | undefined, number][] = [
    [space.reduced, 3],
    [space.intermediate, 5],
    [space.normal, 7],
  ];
  for (const [pair, n] of rates) {
    if (!pair) continue;
    out.push(amount(`${letter}${n}`, pair.base), amount(`${letter}${n + 1}`, pair.tax));
  }
  return out;
}

export function buildQrPayload(input: QrInput): string {
  if (input.fiscalSpaces.length > 3) throw new Error("O QR admite no máximo 3 espaços fiscais");
  const spaces =
    input.fiscalSpaces.length === 0
      ? ["I1:0"]
      : input.fiscalSpaces.flatMap((space, i) => fiscalSpaceFields((["I", "J", "K"] as const)[i]!, space));

  const parts = [
    field("A", input.issuerTaxId),
    field("B", input.customerTaxId),
    field("C", input.customerCountry),
    field("D", input.documentType),
    field("E", input.documentStatus),
    field("F", input.documentDate.replaceAll("-", "")),
    field("G", input.documentNumber),
    field("H", input.atcud),
    ...spaces,
    ...(input.notSubjectAmount ? [amount("L", input.notSubjectAmount)] : []),
    ...(input.stampDuty ? [amount("M", input.stampDuty)] : []),
    amount("N", input.taxPayable),
    amount("O", input.grossTotal),
    ...(input.withholdingTax ? [amount("P", input.withholdingTax)] : []),
    field("Q", input.signatureCode),
    field("R", input.certificateNumber),
    ...(input.otherInfo ? [field("S", input.otherInfo)] : []),
  ];
  return parts.join("*");
}

/** Espaços fiscais a partir dos totais do documento, pela ordem em que aparecem. */
export function qrFiscalSpacesFromTotals(totals: DocumentTotals): QrFiscalSpace[] {
  const byRegion = new Map<string, QrFiscalSpace>();
  const space = (region: string) => {
    const existing = byRegion.get(region);
    if (existing) return existing;
    const created: QrFiscalSpace = { region };
    byRegion.set(region, created);
    return created;
  };
  const slot = { RED: "reduced", INT: "intermediate", NOR: "normal" } as const;

  for (const t of totals.taxSummary) {
    const s = space(t.region);
    const key = slot[t.code];
    const prev = s[key];
    s[key] = prev
      ? { base: add(prev.base, t.taxableBase), tax: add(prev.tax, t.taxAmount) }
      : { base: t.taxableBase, tax: t.taxAmount };
  }
  for (const e of totals.exemptions) {
    const s = space(e.region);
    s.exemptBase = s.exemptBase ? add(s.exemptBase, e.taxableBase) : e.taxableBase;
  }
  return [...byRegion.values()];
}
