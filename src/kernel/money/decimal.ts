/**
 * Decimais exatos para dinheiro e quantidades (sem vírgula flutuante).
 * Valor = units / 10^scale. Arredondamento "metade para longe do zero",
 * aplicado uma só vez no fim de cada operação.
 */
export interface Dec {
  units: bigint;
  scale: number;
}

const TEN = 10n;
const pow10 = (n: number) => TEN ** BigInt(n);

export const dec = (text: string): Dec => {
  const d = parseDecimal(text, ".");
  if (!d) throw new Error(`Decimal inválido: ${text}`);
  return d;
};

/**
 * Lê um número com o separador decimal indicado (o do documento). O outro
 * separador é tratado como milhares e só é aceite em grupos de 3 dígitos.
 * Devolve null quando o texto não é um número válido nesse formato.
 */
export function parseDecimal(text: string, decimalSep: "," | "."): Dec | null {
  const s = text.trim().replace(/[\s\u00a0]/g, "");
  if (!s) return null;
  const thousands = decimalSep === "," ? "." : ",";
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const parts = body.split(decimalSep);
  if (parts.length > 2) return null;
  const [intRaw, frac = ""] = parts as [string, string?];
  const groups = intRaw.split(thousands);
  if (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0]!) || groups.slice(1).some((g) => !/^\d{3}$/.test(g)))) return null;
  const int = groups.join("");
  if (!/^\d+$/.test(int) || !/^\d*$/.test(frac)) return null;
  const units = BigInt(int + frac) * (neg ? -1n : 1n);
  return { units, scale: frac.length };
}

/** Arredonda para `scale` casas (metade para longe do zero). */
export function roundTo(d: Dec, scale: number): Dec {
  if (d.scale <= scale) return { units: d.units * pow10(scale - d.scale), scale };
  const div = pow10(d.scale - scale);
  const q = d.units / div;
  const r = d.units % div;
  const twice = (r < 0n ? -r : r) * 2n;
  const adj = twice >= div ? (d.units < 0n ? -1n : 1n) : 0n;
  return { units: q + adj, scale };
}

export function mul(a: Dec, b: Dec): Dec {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

export function isZero(d: Dec): boolean {
  return d.units === 0n;
}

export function isNegative(d: Dec): boolean {
  return d.units < 0n;
}

/** Euros (decimal) → cêntimos inteiros. */
export function toCents(euros: Dec): number {
  return Number(roundTo(euros, 2).units);
}

/** a × b (ex.: quantidade × preço unitário em euros) → cêntimos, arredondado uma vez. */
export function mulToCents(a: Dec, b: Dec): number {
  return toCents(mul(a, b));
}

/** pct% de um valor em cêntimos → cêntimos (arredondado uma vez). */
export function pctOfCents(cents: number, pct: Dec): number {
  // cents × pct / 100 → em cêntimos com escala pct.scale + 2
  return Number(roundTo({ units: BigInt(cents) * pct.units, scale: pct.scale + 2 }, 0).units);
}

/** Texto canónico (ponto decimal, sem zeros à direita desnecessários). */
export function decToString(d: Dec): string {
  const neg = d.units < 0n;
  const abs = (neg ? -d.units : d.units).toString().padStart(d.scale + 1, "0");
  const int = abs.slice(0, abs.length - d.scale);
  const frac = abs.slice(abs.length - d.scale).replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/**
 * Quantidade com separador ambíguo (ex.: "20.000"): escolhe a leitura que
 * reconcilia com o valor da linha impresso no documento. Sem uma única
 * leitura coerente devolve null (fica para validar — nunca se adivinha).
 */
export function resolveQuantity(text: string, unitPrice: Dec, lineGrossCents: number): Dec | null {
  const options = [parseDecimal(text, ","), parseDecimal(text, ".")].filter((d): d is Dec => !!d);
  const unique = new Map(options.map((d) => [decToString(d), d]));
  const fits = [...unique.values()].filter((q) => mulToCents(q, unitPrice) === lineGrossCents);
  return fits.length === 1 ? fits[0]! : null;
}
