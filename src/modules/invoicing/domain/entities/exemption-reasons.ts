import { InvoicingRuleError } from "../errors.js";
import { isExemptionCode } from "./exemption-codes.js";

/**
 * Menção que consta do documento para cada código de motivo de isenção —
 * «Códigos de Motivo de Isenção», AT, v4.0 (18-06-2026). No SAF-T a
 * `TaxExemptionReason` tem 6–60 caracteres; o M15 oficial tem 61 e vai
 * abreviado (imprime-se a mesma forma que se exporta).
 */
export const EXEMPTION_MENTIONS: Readonly<Record<string, string>> = {
  M01: "Artigo 16.º n.º 6 do CIVA",
  M02: "Artigo 6.º do Decreto-Lei n.º 198/90, de 19 de junho",
  M04: "Isento artigo 13.º do CIVA",
  M05: "Isento artigo 14.º do CIVA",
  M06: "Isento artigo 15.º do CIVA",
  M07: "Isento artigo 9.º do CIVA",
  M09: "IVA – não confere direito a dedução",
  M10: "IVA – regime de isenção",
  M11: "Regime particular do tabaco",
  M12: "Regime da margem de lucro – Agências de viagens",
  M13: "Regime da margem de lucro – Bens em segunda mão",
  M14: "Regime da margem de lucro – Objetos de arte",
  M15: "Regime da margem de lucro-Objetos de coleção e antiguidades",
  M16: "Isento artigo 14.º do RITI",
  M19: "Outras isenções",
  M20: "IVA – regime forfetário",
  M21: "IVA – não confere direito à dedução (ou expressão similar)",
  M25: "Mercadorias à consignação",
  M26: "Isenção de IVA com direito à dedução no cabaz alimentar",
  M30: "IVA - autoliquidação",
  M31: "IVA - autoliquidação",
  M32: "IVA - autoliquidação",
  M33: "IVA - autoliquidação",
  M34: "IVA - autoliquidação",
  M35: "IVA - autoliquidação",
  M40: "IVA - autoliquidação",
  M41: "IVA - autoliquidação",
  M42: "IVA - autoliquidação",
  M43: "IVA - autoliquidação",
  M44: "IVA – Regras específicas - artigo 6.º",
  M45: "IVA – regime transfronteiriço de isenção",
  M46: "IVA – e-TaxFree",
  M99: "Não sujeito ou não tributado",
};

/**
 * Motivos ativos na v1 (restauração), como decidido na pesquisa (§8.7): regime
 * do art. 53.º (M10) e não sujeito (M99, ex.: depósito de embalagens). As
 * autoliquidações (M30–M46) ficam desligadas até a AT confirmar o campo do QR.
 */
export const ENABLED_EXEMPTIONS: ReadonlySet<string> = new Set(["M10", "M99"]);

/** Códigos em que a menção pode (e deve, se aplicável) levar a norma acrescentada (FAQ AT 5972). */
const NORM_APPENDABLE = new Set(["M19", "M99"]);

export function exemptionMention(code: string, norm?: string): string {
  if (!isExemptionCode(code) || !EXEMPTION_MENTIONS[code]) throw new InvoicingRuleError(`Código de motivo de isenção desconhecido: ${code}`);
  if (!ENABLED_EXEMPTIONS.has(code)) throw new InvoicingRuleError(`O motivo de isenção ${code} não está ativo no Mezza`);
  const extra = norm?.trim();
  if (extra && !NORM_APPENDABLE.has(code)) throw new InvoicingRuleError(`O motivo ${code} não aceita norma acrescentada`);
  const mention = extra ? `${EXEMPTION_MENTIONS[code]} - ${extra}` : EXEMPTION_MENTIONS[code]!;
  if (mention.length < 6 || mention.length > 60) throw new InvoicingRuleError(`Menção de isenção com ${mention.length} caracteres (6–60)`);
  return mention;
}
