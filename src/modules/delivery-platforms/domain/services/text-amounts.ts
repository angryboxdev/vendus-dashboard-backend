/** Ajudas para ler valores e datas do texto extraído dos PDF das plataformas. */

/** «4 074,30 €», «1.633,60 €», «-785,06 €», «19.28» → cêntimos. null se não for um valor. */
export function parseAmountCents(raw: string): number | null {
  let s = raw.replace(/€|\s| | /g, "");
  if (!/^[-−]?[\d.,]+$/.test(s)) return null;
  const negative = /^[-−]/.test(s);
  s = s.replace(/^[-−]/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  // O separador decimal é o último que aparece com 1–2 dígitos a seguir; o outro é de milhares.
  const decimalSep = lastComma > lastDot ? "," : lastDot > lastComma && /\.\d{1,2}$/.test(s) ? "." : null;
  const [intPart, decPart = ""] = decimalSep ? [s.slice(0, s.lastIndexOf(decimalSep)), s.slice(s.lastIndexOf(decimalSep) + 1)] : [s, ""];
  const digits = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(digits) || !/^\d{0,2}$/.test(decPart)) return null;
  const cents = Number(digits) * 100 + Number(decPart.padEnd(2, "0") || 0);
  return negative ? -cents : cents;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Valor na mesma linha de um rótulo (ex.: «Taxas de mercado	-1 403,87 €»). `label` é texto literal
 * ou uma expressão regular para o início da linha. null quando o rótulo não aparece.
 */
export function amountAfterLabel(text: string, label: string | RegExp): number | null {
  const head = typeof label === "string" ? escape(label) : label.source;
  const m = new RegExp(`^\\s*${head}[^\\n]*?\\s(-?[\\d.,\\u00a0\\u202f ]*\\d)\\s*€?\\*?\\s*$`, "mi").exec(text);
  return m ? parseAmountCents(m[1]!) : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** «Sep 07, 2026» → «2026-09-07». */
export function parseEnglishDate(raw: string): string | null {
  const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(raw);
  const month = m ? MONTHS[m[1]!.toLowerCase()] : undefined;
  return m && month ? `${m[3]}-${pad(month)}-${pad(Number(m[2]))}` : null;
}
