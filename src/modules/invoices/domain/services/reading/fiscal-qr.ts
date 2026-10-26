import { parseDecimal, toCents } from "../../../../../kernel/money/decimal.js";
import type { FiscalQr, FiscalQrTaxBand, FiscalQrTaxSpace } from "../../entities/invoice-reading.js";

/**
 * QR fiscal AT (especificação técnica do código QR da AT): pares `campo:valor`
 * separados por `*`, divididos pelo PRIMEIRO `:` de cada par. O QR dá identidade
 * e totais por espaço fiscal/taxa — não tem artigos nem prova sozinho a autenticidade.
 */

const REQUIRED = ["A", "B", "C", "D", "E", "F", "G", "H", "N", "O"] as const;

/** Parece um QR fiscal AT (e não outro QR da página)? */
export function looksLikeAtQr(text: string): boolean {
  return /^A:[^*]+\*B:[^*]+\*C:/.test(text.trim());
}

export function splitAtQrFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const pair of text.trim().split("*")) {
    const i = pair.indexOf(":");
    if (i <= 0) continue;
    fields[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return fields;
}

const cents = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const d = parseDecimal(v, ".");
  return d ? toCents(d) : null;
};

function band(f: Record<string, string>, s: string, baseKey: number): FiscalQrTaxBand | null {
  const base = cents(f[`${s}${baseKey}`]);
  const vat = cents(f[`${s}${baseKey + 1}`]);
  return base === null && vat === null ? null : { baseCents: base ?? 0, vatCents: vat ?? 0 };
}

export type FiscalQrParse = { ok: true; qr: FiscalQr } | { ok: false; reason: string };

export function parseAtQr(text: string): FiscalQrParse {
  if (!looksLikeAtQr(text)) return { ok: false, reason: "not_at_qr" };
  const f = splitAtQrFields(text);
  const missing = REQUIRED.filter((k) => !f[k]);
  if (missing.length) return { ok: false, reason: `missing_fields:${missing.join(",")}` };
  for (const k of ["N", "O", "L", "M", "P"]) if (f[k] !== undefined && cents(f[k]) === null) return { ok: false, reason: `invalid_amount:${k}` };

  const taxSpaces: FiscalQrTaxSpace[] = [];
  for (const s of ["I", "J", "K"] as const) {
    const region = f[`${s}1`];
    // "I1:0" = documento sem IVA indicado.
    if (!region || region === "0") continue;
    taxSpaces.push({
      space: s,
      region,
      exemptBaseCents: cents(f[`${s}2`]) ?? 0,
      reduced: band(f, s, 3),
      intermediate: band(f, s, 5),
      normal: band(f, s, 7),
    });
  }
  const date = /^\d{8}$/.test(f.F!) ? `${f.F!.slice(0, 4)}-${f.F!.slice(4, 6)}-${f.F!.slice(6, 8)}` : null;
  return {
    ok: true,
    qr: {
      issuerNif: f.A!,
      buyerNif: f.B ?? null,
      buyerCountry: f.C ?? null,
      documentType: f.D!,
      documentStatus: f.E ?? null,
      issueDate: date,
      documentNumber: f.G!,
      atcud: f.H ?? null,
      taxSpaces,
      notSubjectCents: cents(f.L) ?? 0,
      stampDutyCents: cents(f.M) ?? 0,
      totalTaxCents: cents(f.N)!,
      totalCents: cents(f.O)!,
      withholdingCents: cents(f.P) ?? 0,
      hashExcerpt: f.Q ?? null,
      certificate: f.R ?? null,
      fields: f,
    },
  };
}

/** Bases e IVA do QR por taxa (sem a taxa em %: o QR só diz reduzida/intermédia/normal/isenta). */
export function qrBands(qr: FiscalQr): { kind: "exempt" | "reduced" | "intermediate" | "normal" | "not_subject"; region: string; baseCents: number; vatCents: number }[] {
  const out: ReturnType<typeof qrBands> = [];
  for (const s of qr.taxSpaces) {
    if (s.exemptBaseCents) out.push({ kind: "exempt", region: s.region, baseCents: s.exemptBaseCents, vatCents: 0 });
    for (const k of ["reduced", "intermediate", "normal"] as const) {
      const b = s[k];
      if (b) out.push({ kind: k, region: s.region, ...b });
    }
  }
  if (qr.notSubjectCents) out.push({ kind: "not_subject", region: "", baseCents: qr.notSubjectCents, vatCents: 0 });
  return out;
}

/** Coerência interna: Σ IVA + selo = N; Σ bases + não sujeito + N = O. */
export function checkQrTotals(qr: FiscalQr): { taxDiffCents: number; totalDiffCents: number } {
  const bands = qrBands(qr);
  const vat = bands.reduce((a, b) => a + b.vatCents, 0);
  const bases = bands.reduce((a, b) => a + b.baseCents, 0);
  return { taxDiffCents: qr.totalTaxCents - (vat + qr.stampDutyCents), totalDiffCents: qr.totalCents - (bases + qr.totalTaxCents) };
}

/**
 * Documento de pagamento com várias faturas fiscais (ex.: águas: água/saneamento + resíduos de outro
 * emitente) lançado como uma só fatura: identidade do 1.º QR; bases, IVA, não sujeito e totais de
 * todos (espaços fiscais da mesma região somam-se). Só para conferir as linhas do documento inteiro.
 */
export function combineFiscalQrs(qrs: FiscalQr[]): FiscalQr {
  const [first, ...rest] = qrs;
  if (!first) throw new Error("combineFiscalQrs: sem QR");
  if (!rest.length) return first;
  const addBand = (a: FiscalQr["taxSpaces"][number]["reduced"], b: FiscalQr["taxSpaces"][number]["reduced"]) =>
    a || b ? { baseCents: (a?.baseCents ?? 0) + (b?.baseCents ?? 0), vatCents: (a?.vatCents ?? 0) + (b?.vatCents ?? 0) } : null;
  const spaces: FiscalQr["taxSpaces"] = [];
  for (const s of qrs.flatMap((q) => q.taxSpaces)) {
    const same = spaces.find((x) => x.region === s.region);
    if (!same) spaces.push({ ...s });
    else {
      same.exemptBaseCents += s.exemptBaseCents;
      same.reduced = addBand(same.reduced, s.reduced);
      same.intermediate = addBand(same.intermediate, s.intermediate);
      same.normal = addBand(same.normal, s.normal);
    }
  }
  const sum = (f: (q: FiscalQr) => number) => qrs.reduce((a, q) => a + f(q), 0);
  return {
    ...first,
    taxSpaces: spaces,
    notSubjectCents: sum((q) => q.notSubjectCents),
    stampDutyCents: sum((q) => q.stampDutyCents),
    totalTaxCents: sum((q) => q.totalTaxCents),
    totalCents: sum((q) => q.totalCents),
    withholdingCents: sum((q) => q.withholdingCents),
  };
}
