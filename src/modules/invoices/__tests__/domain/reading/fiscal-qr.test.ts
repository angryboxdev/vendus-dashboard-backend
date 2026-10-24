import { checkQrTotals, looksLikeAtQr, parseAtQr, qrBands, splitAtQrFields } from "../../../domain/services/reading/fiscal-qr.js";
import { QR } from "./synthetic-makro.js";

describe("QR fiscal AT", () => {
  test("interpreta identidade, bases/IVA por taxa e totais (cêntimos)", () => {
    const r = parseAtQr(QR);
    if (!r.ok) throw new Error(r.reason);
    expect(r.qr).toMatchObject({ issuerNif: "502030712", buyerNif: "999999990", documentType: "FT", documentStatus: "N", issueDate: "2026-10-18", documentNumber: "FAC 0001/000001", atcud: "ABCD1234-000001", totalTaxCents: 1316, totalCents: 8063, hashExcerpt: "ab12", certificate: "9999" });
    expect(r.qr.taxSpaces).toEqual([{ space: "I", region: "PT", exemptBaseCents: 840, reduced: { baseCents: 250, vatCents: 15 }, intermediate: null, normal: { baseCents: 5657, vatCents: 1301 } }]);
    expect(checkQrTotals(r.qr)).toEqual({ taxDiffCents: 0, totalDiffCents: 0 });
    expect(qrBands(r.qr).map((b) => b.kind)).toEqual(["exempt", "reduced", "normal"]);
  });

  test("divide cada par pelo PRIMEIRO «:» (o valor pode conter «:»)", () => {
    expect(splitAtQrFields("A:1*G:FT A:1/2*S:x:y")).toEqual({ A: "1", G: "FT A:1/2", S: "x:y" });
  });

  test("outro QR da página não é confundido com o fiscal", () => {
    expect(looksLikeAtQr("https://example.test/A:1")).toBe(false);
    expect(parseAtQr("https://example.test")).toEqual({ ok: false, reason: "not_at_qr" });
  });

  test("campos obrigatórios em falta → inválido, sem inventar", () => {
    expect(parseAtQr("A:502030712*B:999999990*C:PT*D:FT")).toMatchObject({ ok: false });
  });

  test("totais incoerentes são detetados (N e O)", () => {
    const r = parseAtQr(QR.replace("O:80.63", "O:81.63").replace("N:13.16", "N:13.20"));
    if (!r.ok) throw new Error(r.reason);
    expect(checkQrTotals(r.qr)).toEqual({ taxDiffCents: 4, totalDiffCents: 96 });
  });

  test("I1:0 = documento sem IVA indicado (sem espaços fiscais)", () => {
    const r = parseAtQr("A:502030712*B:999999990*C:PT*D:FR*E:N*F:20261018*G:FR 1/1*H:0*I1:0*N:0.00*O:10.00*L:10.00*Q:ab12*R:1");
    if (!r.ok) throw new Error(r.reason);
    expect(r.qr.taxSpaces).toEqual([]);
    expect(checkQrTotals(r.qr)).toEqual({ taxDiffCents: 0, totalDiffCents: 0 });
  });
});
