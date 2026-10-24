import { pctOfCents, dec } from "../../../../../kernel/money/decimal.js";
import type { FiscalQr, ReadVatRow } from "../../entities/invoice-reading.js";
import { qrBands } from "./fiscal-qr.js";

/**
 * Taxa de IVA de cada grupo do QR, sem a presumir: só é aceite a taxa cuja
 * aplicação à base dá exatamente o IVA declarado no próprio QR (± 1 cêntimo de
 * arredondamento). Isento/não sujeito = 0. Sem taxa única que feche → null.
 */
const CANDIDATE_RATES = ["4", "5", "6", "9", "12", "13", "16", "18", "22", "23"];

export type QrVatRow = ReadVatRow & { kind: string; candidates: string[]; zeroInTaxedBand?: boolean };

/** `hints` = taxas impressas no documento (ex.: «23%»), usadas só para desempatar bases pequenas. */
export function qrVatRows(qr: FiscalQr, hints: string[] = []): QrVatRow[] {
  return qrBands(qr).map((b) => {
    if (b.kind === "exempt" || b.kind === "not_subject") return { kind: b.kind, code: "0", rate: "0", baseCents: b.baseCents, vatCents: 0, candidates: ["0"] };
    // Grupo tributado com IVA 0 € (ex.: autoliquidação): a única taxa que fecha é 0 — o chamador avisa.
    if (b.vatCents === 0 && b.baseCents > 0) return { kind: b.kind, code: "0", rate: "0", baseCents: b.baseCents, vatCents: 0, candidates: ["0"], zeroInTaxedBand: true };
    const fits = CANDIDATE_RATES.filter((r) => Math.abs(pctOfCents(b.baseCents, dec(r)) - b.vatCents) <= 1);
    const hinted = fits.filter((r) => hints.includes(r));
    const rate = fits.length === 1 ? fits[0]! : hinted.length === 1 ? hinted[0]! : null;
    return { kind: b.kind, code: rate, rate: rate ?? "?", baseCents: b.baseCents, vatCents: b.vatCents, candidates: fits };
  });
}
