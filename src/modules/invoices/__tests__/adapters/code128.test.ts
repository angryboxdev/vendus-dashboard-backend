import { CODE128_PATTERNS, decodeRuns, scanCode128 } from "../../adapters/out/barcode/code128.js";

/** Codificador de teste: dígitos em Code C (último dígito ímpar em Code B); texto em Code B. */
function encode(text: string): number[] {
  const values: number[] = [];
  if (/^\d+$/.test(text) && text.length >= 2) {
    values.push(105);
    let i = 0;
    for (; i + 1 < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
    if (i < text.length) values.push(100, text.charCodeAt(i) - 32);
  } else {
    values.push(104, ...[...text].map((c) => c.charCodeAt(0) - 32));
  }
  const check = values.reduce((a, v, k) => a + (k === 0 ? v : v * k), 0) % 103;
  return [...values, check, 106].flatMap((v) => CODE128_PATTERNS[v]!);
}

/** Imagem RGBA com o código (módulo `m` px, `h` px de altura) e zonas brancas. */
function render(runs: number[], m = 3, h = 40, mirror = false) {
  const quiet = 20 * m;
  const seq = mirror ? runs.slice().reverse() : runs;
  const width = quiet * 2 + seq.reduce((a, r) => a + r * m, 0);
  const height = h + 20;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  let x = quiet;
  seq.forEach((r, i) => {
    if (i % 2 === 0) for (let y = 10; y < 10 + h; y++) for (let k = 0; k < r * m; k++) { const p = (y * width + x + k) * 4; data[p] = data[p + 1] = data[p + 2] = 0; }
    x += r * m;
  });
  return { data, width, height };
}

const PAYLOAD = "56102100066280692393323078100000004000080"; // 41 dígitos (formato do exemplo AT)

describe("CODE128 local", () => {
  test("41 dígitos (Code C + último dígito em Code B) — ida e volta", () => {
    expect(decodeRuns(encode(PAYLOAD))).toBe(PAYLOAD);
    const img = render(encode(PAYLOAD));
    expect(scanCode128(img.data, img.width, img.height)).toEqual({ status: "decoded", payload: PAYLOAD });
  });

  test("zeros à esquerda e texto preservados", () => {
    expect(decodeRuns(encode("000123"))).toBe("000123");
    expect(decodeRuns(encode("REF-0042"))).toBe("REF-0042");
  });

  test("código rodado 180° também é lido", () => {
    const img = render(encode(PAYLOAD), 2, 40, true);
    expect(scanCode128(img.data, img.width, img.height)).toEqual({ status: "decoded", payload: PAYLOAD });
  });

  test("dígito de controlo errado → nunca devolve um valor (visível mas ilegível)", () => {
    const runs = encode(PAYLOAD);
    // Troca um símbolo de dados por outro válido: o controlo deixa de bater.
    const broken = [...runs.slice(0, 12), ...CODE128_PATTERNS[7]!, ...runs.slice(18)];
    expect(decodeRuns(broken)).toBeNull();
    const img = render(broken);
    expect(scanCode128(img.data, img.width, img.height)).toEqual({ status: "unreadable" });
  });

  test("página sem código (texto/ruído) → absent, nunca «ilegível»", () => {
    const width = 400, height = 60;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    // «Texto»: traços curtos que mudam de linha para linha.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if ((x * 7 + y * 13) % 11 < 2 && (y % 9) < 6) { const p = (y * width + x) * 4; data[p] = data[p + 1] = data[p + 2] = 0; }
    expect(scanCode128(data, width, height)).toEqual({ status: "absent" });
  });
});
