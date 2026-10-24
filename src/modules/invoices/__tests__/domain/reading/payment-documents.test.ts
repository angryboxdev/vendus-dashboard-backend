import { detectDocumentKind, readPaymentDocument } from "../../../domain/services/reading/payment-documents.js";
import type { BarcodeState } from "../../../domain/entities/payment-document.js";
import { AT_BARCODE, syntheticAt, syntheticReceipt, syntheticSs } from "./synthetic-payment-docs.js";

const decoded = (payload = AT_BARCODE): BarcodeState => ({ status: "decoded", symbology: "CODE128", payload, page: 1 });
const at = (content = syntheticAt(), barcode: BarcodeState = decoded(), today = "2026-11-10") =>
  readPaymentDocument({ content, kind: "at_withholding", barcode, today, organizationNif: "999999990" });
const ss = (content = syntheticSs(), today = "2026-11-10") =>
  readPaymentDocument({ content, kind: "ss_payment_reference", barcode: { status: "absent" }, today, organizationNif: "999999990" });
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe("deteção do tipo de documento", () => {
  test("AT, SS, comprovativo, sem texto", () => {
    expect(detectDocumentKind(syntheticAt(), null)).toBe("at_withholding");
    expect(detectDocumentKind(syntheticSs(), null)).toBe("ss_payment_reference");
    expect(detectDocumentKind(syntheticReceipt(), null)).toBe("unknown");
    expect(detectDocumentKind({ pages: [{ number: 1, width: 595, height: 842, words: [] }], qrCodes: [] }, null)).toBe("unknown");
  });
});

describe("AT — retenções na fonte", () => {
  test("campos do texto; referência ao Estado separada do código de barras; sem IVA", () => {
    const r = at();
    expect(r).toMatchObject({
      obligationType: "obrigacao_fiscal", subtype: "retencoes_irs_prediais", issuer: "AT", documentNumber: "12345678901", taxpayerNif: "999999990",
      period: "2026-10", paymentReference: "123456789012345", totalCents: 25000, dueDate: "2026-11-20", declarationReceivedAt: "2026-11-05 10:00:00",
      vat: "not_applicable", barcode: { status: "decoded", payload: AT_BARCODE }, status: "ready",
    });
    expect(r.lines).toEqual([{ code: "104", description: "104 - IRS - Prediais", amountCents: 25000, interestCents: 0, totalCents: 25000 }]);
    expect(r.paymentReference).not.toBe(r.barcode.status === "decoded" ? r.barcode.payload : "");
  });

  test("código de barras diferente do valor impresso bloqueia", () => {
    expect(codes(at(syntheticAt(), decoded("9".repeat(41))))).toContain("barcode_text_mismatch");
  });

  test("sem código de barras ou ilegível: não falha — campos vêm do texto", () => {
    expect(at(syntheticAt({ printed: null }), { status: "absent" }).status).toBe("ready");
    const r = at(syntheticAt(), { status: "unreadable", page: 1 });
    expect(r.status).toBe("ready");
    expect(codes(r)).toEqual(["barcode_unreadable"]);
  });

  test("vários impostos: a soma tem de dar o valor a pagar", () => {
    const ok = at(syntheticAt({ amount: "300,00", taxLines: [["104 - IRS - Prediais", "250,00"], ["114 - IRS - Independentes", "50,00"]] }));
    expect(ok).toMatchObject({ subtype: "retencoes_na_fonte", status: "ready" });
    const bad = at(syntheticAt({ amount: "300,00", taxLines: [["104 - IRS - Prediais", "250,00"]] }));
    expect(codes(bad)).toContain("totals_mismatch");
  });

  test("campos contraditórios e formato da referência", () => {
    expect(codes(at(syntheticAt({ importancia: "260,00" })))).toContain("totals_mismatch");
    expect(codes(at(syntheticAt({ reference: "123.456.789.012" })))).toContain("field_missing");
  });

  test("prazo expirado avisa sem alterar a data; NIF de outra empresa bloqueia", () => {
    const late = at(syntheticAt(), decoded(), "2026-12-01");
    expect(codes(late)).toContain("due_date_passed");
    expect(late.dueDate).toBe("2026-11-20");
    expect(codes(at(syntheticAt({ nif: "123456789" })))).toContain("taxpayer_not_organization");
  });
});

describe("Segurança Social — referência para pagamento", () => {
  test("lida sem qualquer código; entidade/referência MB (zeros à esquerda), juros, validade", () => {
    expect(ss()).toMatchObject({
      obligationType: "obrigacao_contributiva", subtype: "seguranca_social_entidade_empregadora", issuer: "SS", taxpayerNif: "999999990",
      period: "2026-10", mbEntity: "12345", paymentReference: "098765432", amountCents: 8850, interestCents: 0, totalCents: 8850,
      issueDate: "2026-11-10", dueDate: "2026-11-24", vat: "not_applicable", barcode: { status: "absent" }, status: "ready",
    });
  });

  test("NISS e código de acesso nunca aparecem na leitura", () => {
    const json = JSON.stringify(ss());
    expect(json).not.toContain("12345678901");
    expect(json).not.toContain("9-zzzz");
  });

  test("juros e totais: contribuição + juros = total; MB = total a pagar", () => {
    const withInterest = ss(syntheticSs({ total: "90,00", detail: [["202610", "88,50", "1,50", "90,00"]] }));
    expect(withInterest).toMatchObject({ amountCents: 8850, interestCents: 150, totalCents: 9000, status: "ready" });
    expect(codes(ss(syntheticSs({ mbValue: "80,00" })))).toContain("totals_mismatch");
    expect(codes(ss(syntheticSs({ detail: [["202610", "88,50", "1,00", "88,50"]] })))).toContain("totals_mismatch");
  });

  test("validade passada avisa (não bloqueia)", () => {
    const r = ss(syntheticSs(), "2026-12-01");
    expect(codes(r)).toEqual(["due_date_passed"]);
    expect(r.status).toBe("ready");
  });
});
