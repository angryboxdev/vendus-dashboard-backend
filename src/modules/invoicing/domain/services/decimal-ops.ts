import type { Dec } from "../../../../kernel/money/decimal.js";

/** Operações exatas sobre `Dec` que o kernel não tem (soma, subtração, divisão arredondada). */

const pow10 = (n: number) => 10n ** BigInt(n);

const align = (a: Dec, b: Dec): [bigint, bigint, number] => {
  const scale = Math.max(a.scale, b.scale);
  return [a.units * pow10(scale - a.scale), b.units * pow10(scale - b.scale), scale];
};

export const ZERO: Dec = { units: 0n, scale: 0 };

export function add(a: Dec, b: Dec): Dec {
  const [x, y, scale] = align(a, b);
  return { units: x + y, scale };
}

export function sub(a: Dec, b: Dec): Dec {
  const [x, y, scale] = align(a, b);
  return { units: x - y, scale };
}

export function compare(a: Dec, b: Dec): number {
  const [x, y] = align(a, b);
  return x === y ? 0 : x < y ? -1 : 1;
}

/** n / d arredondado ao inteiro (metade para longe do zero). */
function roundDiv(n: bigint, d: bigint): bigint {
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = an / ad;
  const r = an % ad;
  const out = r * 2n >= ad ? q + 1n : q;
  return neg ? -out : out;
}

/** a × num / den, arredondado a `scale` casas (uma só vez). */
export function mulDivRound(a: Dec, num: Dec, den: Dec, scale: number): Dec {
  // a·num/den = (a.u·num.u·10^den.s) / (den.u·10^(a.s+num.s)); escala final `scale`
  const n = a.units * num.units * pow10(den.scale + scale);
  const d = den.units * pow10(a.scale + num.scale);
  return { units: roundDiv(n, d), scale };
}

/** Percentagem como fator: 100 − p (ex.: desconto 10 → 90). */
export function hundredMinus(p: Dec): Dec {
  return { units: 100n * pow10(p.scale) - p.units, scale: p.scale };
}

export function hundredPlus(p: Dec): Dec {
  return { units: 100n * pow10(p.scale) + p.units, scale: p.scale };
}

export const HUNDRED: Dec = { units: 100n, scale: 0 };
