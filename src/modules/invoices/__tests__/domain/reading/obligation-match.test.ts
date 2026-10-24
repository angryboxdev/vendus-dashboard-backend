import { matchObligations, type ExistingObligation } from "../../../domain/services/reading/obligation-match.js";
import { readPaymentDocument } from "../../../domain/services/reading/payment-documents.js";
import { syntheticAt } from "./synthetic-payment-docs.js";

const reading = readPaymentDocument({ content: syntheticAt(), kind: "at_withholding", barcode: { status: "absent" }, today: "2026-11-10", organizationNif: "999999990" });
const ex = (over: Partial<ExistingObligation>): ExistingObligation => ({
  source: "invoice", id: "x", invoiceId: null, label: "", supplierName: "DGTF", amountCents: 25000, dueDate: null, documentDate: null, status: "pending", ...over,
});

describe("procura da mesma obrigação já registada", () => {
  test("mesmo número do documento ou mesma referência → forte", () => {
    expect(matchObligations(reading, [ex({ id: "a", label: "Fatura 12345678901", amountCents: 1 })])[0]).toMatchObject({ strength: "strong", reasons: ["same_document_number"] });
    expect(matchObligations(reading, [ex({ id: "b", label: "123456789012345", amountCents: 1 })])[0]!.reasons).toEqual(["same_reference"]);
  });

  test("número com dígitos trocados (leitura antiga por IA) + mesmo valor e vencimento → forte", () => {
    const [m] = matchObligations(reading, [ex({ id: "c", label: "Fatura 12345687901", dueDate: "2026-11-20" })]);
    expect(m).toMatchObject({ strength: "strong", reasons: ["similar_number", "same_amount_and_due_date"] });
  });

  test("só o mesmo valor dentro do período → possível; fora do período ou outro valor → nada", () => {
    expect(matchObligations(reading, [ex({ id: "d", documentDate: "2026-11-03" })])[0]).toMatchObject({ strength: "possible", reasons: ["same_amount_in_period"] });
    expect(matchObligations(reading, [ex({ id: "e", documentDate: "2026-03-01" })])).toEqual([]);
    expect(matchObligations(reading, [ex({ id: "f", amountCents: 25001, dueDate: "2026-11-20" })])).toEqual([]);
  });

  test("conta a pagar da mesma fatura não aparece duas vezes; canceladas ignoradas", () => {
    const r = matchObligations(reading, [
      ex({ id: "inv", source: "invoice", invoiceId: "inv", label: "12345678901" }),
      ex({ id: "pay", source: "payable", invoiceId: "inv", label: "Fatura 12345678901" }),
      ex({ id: "old", label: "12345678901", status: "cancelled" }),
    ]);
    expect(r.map((m) => m.existing.id)).toEqual(["inv"]);
  });
});
