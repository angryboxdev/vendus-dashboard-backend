/**
 * Descodificador CODE128 local (sem dependências): linhas de píxeis → larguras
 * de barras/espaços → símbolos. Só aceita leituras com arranque, paragem e
 * dígito de controlo válidos — nunca devolve um valor «provável».
 */

/** Larguras (barra, espaço, …) de cada valor 0–105; 106 = paragem (7 elementos). */
export const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
].map((p) => [...p].map(Number));

const START_A = 103, START_B = 104, START_C = 105, STOP = 106;

/** Valor do símbolo de 6 elementos (normalizados a 11 módulos) ou -1. */
function matchSymbol(widths: number[]): number {
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  const unit = total / 11;
  let best = -1, bestErr = Infinity;
  for (let v = 0; v < 106; v++) {
    const p = CODE128_PATTERNS[v]!;
    let err = 0;
    for (let i = 0; i < 6; i++) err += Math.abs(widths[i]! / unit - p[i]!);
    if (err < bestErr) { bestErr = err; best = v; }
  }
  return bestErr <= 2.2 ? best : -1;
}

/** Valores → texto (conjuntos A/B/C, trocas e SHIFT). null se a sequência for inválida. */
function valuesToText(values: number[]): string | null {
  type CodeSet = "A" | "B" | "C";
  let set: CodeSet | null = values[0] === START_A ? "A" : values[0] === START_B ? "B" : values[0] === START_C ? "C" : null;
  if (!set) return null;
  let out = "";
  let shift = false;
  for (const v of values.slice(1)) {
    const cur: CodeSet = shift ? (set === "A" ? "B" : "A") : set;
    shift = false;
    if (cur === "C") {
      if (v < 100) out += String(v).padStart(2, "0");
      else if (v === 100) set = "B";
      else if (v === 101) set = "A";
      else if (v === 102) continue; // FNC1
      else return null;
      continue;
    }
    if (v < 64) out += String.fromCharCode(cur === "A" ? v + 32 : v + 32);
    else if (v < 96) out += String.fromCharCode(cur === "A" ? v - 64 : v + 32);
    else if (v === 98) shift = true;
    else if (v === 99) set = "C";
    else if (v === 100) set = cur === "A" ? "B" : set; // em B, 100 = FNC4 (ignorado)
    else if (v === 101) set = cur === "B" ? "A" : set; // em A, 101 = FNC4 (ignorado)
    else if (v === 102 || v === 96 || v === 97) continue; // FNC1–FNC3
    else return null;
  }
  return out;
}

/** Tenta descodificar a partir de uma sequência de larguras que começa numa barra. */
export function decodeRuns(runs: number[]): string | null {
  for (let s = 0; s + 6 <= runs.length; s += 2) {
    const start = matchSymbol(runs.slice(s, s + 6));
    if (start < START_A || start > START_C) continue;
    const values = [start];
    let i = s + 6;
    while (i + 6 <= runs.length) {
      // Paragem: 7 elementos, 13 módulos; antes dela vem o dígito de controlo.
      if (i + 7 <= runs.length && values.length >= 3) {
        const seven = runs.slice(i, i + 7);
        const unit = seven.reduce((a, b) => a + b, 0) / 13;
        const stopErr = seven.reduce((a, w, k) => a + Math.abs(w / unit - CODE128_PATTERNS[STOP]![k]!), 0);
        // A paragem fecha o segmento (a seguir só zona branca).
        if (stopErr <= 1.5 && i + 7 === runs.length) {
          const data = values.slice(0, -1);
          const check = values[values.length - 1]!;
          const sum = data.reduce((a, v, k) => a + (k === 0 ? v : v * k), 0);
          if (sum % 103 === check) {
            const text = valuesToText(data);
            if (text !== null) return text;
          }
        }
      }
      const v = matchSymbol(runs.slice(i, i + 6));
      if (v < 0 || v >= START_A) break;
      values.push(v);
      i += 6;
    }
  }
  return null;
}

/** Larguras de barras/espaços de uma linha binarizada, a começar na primeira barra. */
export function rowRuns(dark: (x: number) => boolean, width: number): number[] {
  const runs: number[] = [];
  let x = 0;
  while (x < width && !dark(x)) x++;
  let cur = true, len = 0;
  for (; x < width; x++) {
    const d = dark(x);
    if (d === cur) len++;
    else { runs.push(len); cur = d; len = 1; }
  }
  if (cur) runs.push(len);
  return runs;
}

export type Code128Scan = { status: "decoded"; payload: string } | { status: "unreadable" } | { status: "absent" };

/** Segmentos densos de uma linha (barras separadas por espaços curtos), isolados por zona branca. */
function segments(runs: number[], quiet: number): { x: number; runs: number[] }[] {
  const out: { x: number; runs: number[] }[] = [];
  let x = 0, cur: number[] = [], curX = 0;
  for (let i = 0; i < runs.length; i++) {
    const isSpace = i % 2 === 1;
    if (isSpace && runs[i]! >= quiet) {
      if (cur.length) out.push({ x: curX, runs: cur });
      cur = [];
    } else {
      if (!cur.length) curX = x;
      cur.push(runs[i]!);
    }
    x += runs[i]!;
  }
  if (cur.length) out.push({ x: curX, runs: cur });
  return out.filter((s) => s.runs.length >= 31); // arranque + ≥ 3 símbolos + paragem
}

const sameShape = (a: { x: number; runs: number[] }, b: { x: number; runs: number[] }) =>
  Math.abs(a.x - b.x) <= 2 && a.runs.length === b.runs.length && a.runs.every((w, i) => Math.abs(w - b.runs[i]!) <= 1);

/**
 * Procura um CODE128 numa imagem RGBA, linha a linha, nos dois sentidos.
 * - Só lê segmentos isolados por zona branca (norma: ≥ 10 módulos).
 * - Aceita o valor quando a mesma leitura válida se repete em ≥ 2 linhas.
 * - «unreadable»: o mesmo padrão de barras repete-se verticalmente (≥ 10 linhas
 *   seguidas) sem leitura válida — código visível mas ilegível. Texto não faz isso.
 */
export function scanCode128(rgba: Uint8ClampedArray, width: number, height: number, rowStep = 2): Code128Scan {
  const reads = new Map<string, number>();
  let prev: { x: number; runs: number[] }[] = [];
  let streak = 0;
  let barcodeLike = false;
  for (let y = 0; y < height; y += rowStep) {
    const base = y * width * 4;
    const lum = (x: number) => 0.299 * rgba[base + x * 4]! + 0.587 * rgba[base + x * 4 + 1]! + 0.114 * rgba[base + x * 4 + 2]!;
    const runs = rowRuns((x) => lum(x) < 128, width);
    const minBar = Math.max(1, Math.min(...runs.filter((_, i) => i % 2 === 0)));
    const segs = runs.length >= 31 ? segments(runs, Math.max(8, minBar * 8)) : [];
    streak = segs.some((s) => prev.some((p) => sameShape(s, p))) ? streak + 1 : 0;
    if (streak >= 10) barcodeLike = true;
    prev = segs;
    for (const s of segs) {
      const text = decodeRuns(s.runs) ?? decodeRuns(s.runs.slice().reverse());
      if (text === null) continue;
      const n = (reads.get(text) ?? 0) + 1;
      if (n >= 2) return { status: "decoded", payload: text };
      reads.set(text, n);
    }
  }
  return barcodeLike ? { status: "unreadable" } : { status: "absent" };
}
