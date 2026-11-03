import { isNegative, isZero, mul, roundTo, type Dec } from "../../../../kernel/money/decimal.js";
import { InvoicingRuleError } from "../errors.js";
import { isExemptionCode } from "../entities/exemption-codes.js";
import { add, compare, HUNDRED, hundredMinus, hundredPlus, mulDivRound, sub, ZERO } from "./decimal-ops.js";

/** Espaço fiscal (TaxCountryRegion): continente, Açores, Madeira. */
export type TaxRegion = "PT" | "PT-AC" | "PT-MA";
/** Taxa reduzida, intermédia, normal (TaxCode do SAF-T). */
export type TaxRateCode = "RED" | "INT" | "NOR";

export type LineTax =
  | { kind: "rate"; region: TaxRegion; code: TaxRateCode; percentage: Dec }
  | { kind: "exempt"; region: TaxRegion; exemptionCode: string; exemptionReason: string };

export interface DraftLine {
  description: string;
  quantity: Dec;
  /** Com IVA se `pricesIncludeTax`, senão sem IVA. */
  unitPrice: Dec;
  /** 0–100 %. */
  discountPct?: Dec;
  tax: LineTax;
}

export interface LineAmount {
  line: DraftLine;
  /** Valor da linha depois do desconto (com IVA se os preços o incluem). */
  amount: Dec;
}

export interface TaxSummaryEntry {
  region: TaxRegion;
  code: TaxRateCode;
  percentage: Dec;
  taxableBase: Dec;
  taxAmount: Dec;
}

export interface ExemptionSummaryEntry {
  region: TaxRegion;
  code: string;
  reason: string;
  taxableBase: Dec;
}

export interface DocumentTotals {
  lines: LineAmount[];
  taxSummary: TaxSummaryEntry[];
  exemptions: ExemptionSummaryEntry[];
  netTotal: Dec;
  taxPayable: Dec;
  grossTotal: Dec;
}

const MONEY = 2;
/** Precisão intermédia das linhas com preço sem IVA (Despacho 3.2.3: mais de 2 casas). */
const LINE_PRECISION = 6;

function validateLine(line: DraftLine): void {
  if (!line.description.trim()) throw new InvoicingRuleError("Linha sem descrição");
  if (isNegative(line.quantity) || isZero(line.quantity)) throw new InvoicingRuleError("Quantidade tem de ser positiva");
  if (isNegative(line.unitPrice)) throw new InvoicingRuleError("Preço unitário não pode ser negativo");
  if (line.discountPct && (isNegative(line.discountPct) || compare(line.discountPct, HUNDRED) > 0)) {
    throw new InvoicingRuleError("Desconto fora do intervalo 0–100 %");
  }
  const tax = line.tax;
  if (tax.kind === "rate") {
    if (isNegative(tax.percentage) || isZero(tax.percentage)) {
      throw new InvoicingRuleError("Taxa de IVA 0 % tem de ser registada como isenção com código de motivo");
    }
  } else {
    if (!isExemptionCode(tax.exemptionCode)) throw new InvoicingRuleError(`Código de motivo de isenção desconhecido: ${tax.exemptionCode}`);
    if (!tax.exemptionReason.trim()) throw new InvoicingRuleError("Isenção sem menção do motivo");
  }
}

function lineAmount(line: DraftLine, pricesIncludeTax: boolean): Dec {
  const gross = mul(line.quantity, line.unitPrice);
  const discounted = line.discountPct ? mulDivRound(gross, hundredMinus(line.discountPct), HUNDRED, LINE_PRECISION) : gross;
  // Com IVA incluído, o valor da linha é o que o cliente vê: 2 casas.
  return roundTo(discounted, pricesIncludeTax ? MONEY : LINE_PRECISION);
}

/**
 * Totais do documento. Com IVA incluído (restauração), o total por taxa é
 * fixo e o IVA sai dele: IVA = total × p/(100+p), base = total − IVA. Sem IVA
 * incluído: base por taxa arredondada uma vez, IVA = base × p/100.
 */
export function computeDocumentTotals(input: { lines: DraftLine[]; pricesIncludeTax: boolean }): DocumentTotals {
  if (input.lines.length === 0) throw new InvoicingRuleError("Documento sem linhas");
  input.lines.forEach(validateLine);

  const lines = input.lines.map((line) => ({ line, amount: lineAmount(line, input.pricesIncludeTax) }));

  const rated = new Map<string, { tax: Extract<LineTax, { kind: "rate" }>; sum: Dec }>();
  const exempt = new Map<string, { region: TaxRegion; code: string; reason: string; sum: Dec }>();
  for (const { line, amount } of lines) {
    const tax = line.tax;
    if (tax.kind === "rate") {
      const key = `${tax.region}|${tax.code}|${roundTo(tax.percentage, 4).units}`;
      const entry = rated.get(key) ?? { tax, sum: ZERO };
      rated.set(key, { ...entry, sum: add(entry.sum, amount) });
    } else {
      const key = `${tax.region}|${tax.exemptionCode}|${tax.exemptionReason}`;
      const entry = exempt.get(key) ?? { region: tax.region, code: tax.exemptionCode, reason: tax.exemptionReason, sum: ZERO };
      exempt.set(key, { ...entry, sum: add(entry.sum, amount) });
    }
  }

  const taxSummary: TaxSummaryEntry[] = [...rated.values()].map(({ tax, sum }) => {
    if (input.pricesIncludeTax) {
      const gross = roundTo(sum, MONEY);
      const taxAmount = mulDivRound(gross, tax.percentage, hundredPlus(tax.percentage), MONEY);
      return { region: tax.region, code: tax.code, percentage: tax.percentage, taxableBase: sub(gross, taxAmount), taxAmount };
    }
    const taxableBase = roundTo(sum, MONEY);
    const taxAmount = mulDivRound(taxableBase, tax.percentage, HUNDRED, MONEY);
    return { region: tax.region, code: tax.code, percentage: tax.percentage, taxableBase, taxAmount };
  });

  const exemptions: ExemptionSummaryEntry[] = [...exempt.values()].map((e) => ({
    region: e.region,
    code: e.code,
    reason: e.reason,
    taxableBase: roundTo(e.sum, MONEY),
  }));

  const netTotal = roundTo(
    [...taxSummary.map((t) => t.taxableBase), ...exemptions.map((e) => e.taxableBase)].reduce(add, ZERO),
    MONEY,
  );
  const taxPayable = roundTo(taxSummary.map((t) => t.taxAmount).reduce(add, ZERO), MONEY);
  return { lines, taxSummary, exemptions, netTotal, taxPayable, grossTotal: add(netTotal, taxPayable) };
}
