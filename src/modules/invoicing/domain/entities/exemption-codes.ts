/**
 * Códigos de motivo de isenção/não liquidação aceites pela AT — «Tabela dos
 * Códigos de Motivo de Isenção», versão 4.0 (18-06-2026). Atualizar quando a
 * AT publicar nova versão.
 */
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `M${String(from + i).padStart(2, "0")}`);

export const EXEMPTION_CODES: ReadonlySet<string> = new Set([
  "M01",
  "M02",
  ...range(4, 7),
  ...range(9, 16),
  ...range(19, 21),
  "M25",
  "M26",
  ...range(30, 35),
  ...range(40, 46),
  "M99",
]);

export const isExemptionCode = (code: string): boolean => EXEMPTION_CODES.has(code);

/**
 * «Não sujeito ou não tributado» (M99): no QR vai para o campo L e não para a
 * base isenta I2 (especificação QR v1.1, §4). A classificação das
 * autoliquidações (M30–M46) no QR está por confirmar com a AT.
 */
export const isNotSubjectCode = (code: string): boolean => code === "M99";
