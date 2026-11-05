import { BARCODE, POS_VAT_RATES, type NewPosProduct, type PosVatRate } from "../entities/pos.js";

/**
 * Exportação de produtos do Vendus (CSV, separador «,», decimais com vírgula,
 * campos entre aspas) → produtos do POS. Puro.
 * Ignora linhas a 0 € (modificadores, cupões, ofertas) e duplicados pelo nome
 * (fica a primeira linha com categoria); assinala o que precisa de revisão.
 */
export interface CsvImportRow {
  /** Linha no ficheiro (1 = cabeçalho). */
  line: number;
  ref: string;
  name: string;
  category: string | null;
  priceCents: number;
  vatRate: number | null;
  status: "import" | "skip";
  reason: string | null;
  warnings: string[];
  product: NewPosProduct | null;
}

export interface CsvImportPreview {
  rows: CsvImportRow[];
  toImport: number;
  skipped: number;
}

/** CSV (RFC 4180): aspas, vírgulas e quebras de linha dentro de aspas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** «9,9000» → 990 cêntimos; texto inválido → null. */
export function priceToCents(text: string): number | null {
  const t = text.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [int, frac = ""] = t.split(".");
  const cents = Number(int) * 100 + Number((frac + "00").slice(0, 2));
  const rest = frac.slice(2).replace(/0+$/, "");
  // Arredonda ao cêntimo (meio para cima) quando há mais casas.
  return rest && Number(rest[0]) >= 5 ? cents + 1 : cents;
}

const COLUMNS = { name: "Nome", category: "Categoria", ref: "Referência", price: "PVP", vat: "IVA - Taxa", type: "Tipo de Produto", stock: "Controlar Stock", barcode: "Código de Barras", image: "Imagem" } as const;

export function previewVendusCsv(text: string): CsvImportPreview {
  const [header, ...data] = parseCsv(text);
  if (!header) return { rows: [], toImport: 0, skipped: 0 };
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, label]) => [k, header.findIndex((h) => h.trim() === label)])) as Record<keyof typeof COLUMNS, number>;
  const missing = (["name", "ref", "price", "vat"] as const).filter((k) => col[k] < 0).map((k) => COLUMNS[k]);
  if (missing.length > 0) throw new Error(`Colunas em falta no ficheiro: ${missing.join(", ")}`);
  const get = (r: string[], k: keyof typeof COLUMNS) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");

  const rows: CsvImportRow[] = data.map((r, i) => {
    const name = get(r, "name").replace(/\s+/g, " ");
    const ref = get(r, "ref");
    const category = get(r, "category") || null;
    const priceCents = priceToCents(get(r, "price"));
    const vatText = get(r, "vat");
    const vatRate = /^\d+(,0+)?$/.test(vatText) ? Number(vatText.split(",")[0]) : null;
    const typeText = get(r, "type").toUpperCase();
    const warnings: string[] = [];
    const base = { line: i + 2, ref, name, category, priceCents: priceCents ?? 0, vatRate, warnings, product: null };

    if (!ref || name.length < 2) return { ...base, status: "skip", reason: "Sem referência ou nome" };
    if (priceCents === null) return { ...base, status: "skip", reason: "Preço inválido" };
    if (priceCents === 0) return { ...base, status: "skip", reason: "Preço 0 € (modificador, cupão ou oferta)" };
    if (vatRate === null || !(POS_VAT_RATES as readonly number[]).includes(vatRate)) return { ...base, status: "skip", reason: `IVA ${vatText || "vazio"} não suportado (6, 13 ou 23 %)` };
    if (typeText === "C") warnings.push("Tipo «C» do Vendus tratado como produto");
    if (!category) warnings.push("Sem categoria");
    if (/duplicado/i.test(name)) warnings.push("O nome contém «Duplicado»");
    return {
      ...base,
      status: "import",
      reason: null,
      product: {
        ref,
        name: name.slice(0, 200),
        category,
        priceCents,
        vatRate: vatRate as PosVatRate,
        productType: typeText === "S" ? "S" : "P",
        trackStock: /^sim$/i.test(get(r, "stock")),
        barcode: BARCODE.test(get(r, "barcode")) ? get(r, "barcode") : null,
        imageUrl: /^https:\/\//.test(get(r, "image")) ? get(r, "image") : null,
      },
    };
  });

  // Duplicados pelo nome: fica a primeira linha com categoria (senão a primeira); as outras saem.
  const groups = new Map<string, CsvImportRow[]>();
  for (const row of rows) if (row.status === "import") groups.set(normalize(row.name), [...(groups.get(normalize(row.name)) ?? []), row]);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group.find((g) => g.category) ?? group[0]!;
    for (const other of group) {
      if (other === keep) continue;
      other.status = "skip";
      other.reason = `Duplicado de ${keep.ref} (linha ${keep.line})`;
      other.product = null;
      if (other.vatRate !== keep.vatRate) keep.warnings.push(`IVA diferente na linha ${other.line} (${other.vatRate} %) — confirmar`);
      if (other.priceCents !== keep.priceCents) keep.warnings.push(`Preço diferente na linha ${other.line}`);
    }
  }
  // A mesma referência duas vezes: fica a primeira.
  const seenRefs = new Map<string, CsvImportRow>();
  for (const row of rows) {
    if (row.status !== "import") continue;
    const first = seenRefs.get(row.ref);
    if (first) {
      row.status = "skip";
      row.reason = `Referência repetida (linha ${first.line})`;
      row.product = null;
    } else seenRefs.set(row.ref, row);
  }
  // O mesmo código de barras em dois produtos: fica no primeiro (é único na organização).
  const seenBarcodes = new Map<string, CsvImportRow>();
  for (const row of rows) {
    const code = row.status === "import" ? row.product?.barcode : null;
    if (!code || !row.product) continue;
    const first = seenBarcodes.get(code);
    if (first) {
      row.product = { ...row.product, barcode: null };
      row.warnings.push(`Código de barras ${code} já está em ${first.ref} — ficou sem código`);
    } else seenBarcodes.set(code, row);
  }
  const toImport = rows.filter((r) => r.status === "import").length;
  return { rows, toImport, skipped: rows.length - toImport };
}
