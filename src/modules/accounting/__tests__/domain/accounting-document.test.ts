import { AccountingDocument } from "../../domain/entities/accounting-document.js";
import {
  CancellationReasonRequiredError,
  DeductibilityOverrideReasonRequiredError,
  InvalidAccountingDocumentTypeError,
  InvalidDeductiblePercentageError,
} from "../../domain/errors.js";

function baseProps() {
  return {
    organizationId: "org-1",
    documentType: "partner_invoice",
    fundingSource: "partner",
    entityName: "Sócio A",
    issueDate: "2026-07-20",
    subtotalWithoutVat: 1000,
    vatAmount: 130,
    totalWithVat: 1130,
    vatDeductibleAmount: 130,
    vatNonDeductibleAmount: 0,
    settlementMethod: "reimbursement",
    createdBy: "user@fonsat.pt",
  };
}

describe("AccountingDocument.create", () => {
  it("cria com estado inicial pending_review", () => {
    const doc = AccountingDocument.create(baseProps());
    expect(doc.status).toBe("pending_review");
  });

  it("rejeita um documentType fora do enum", () => {
    expect(() => AccountingDocument.create({ ...baseProps(), documentType: "bogus" })).toThrow(
      InvalidAccountingDocumentTypeError,
    );
  });

  it("exige motivo quando a percentagem dedutível diverge da sugestão da categoria", () => {
    expect(() => AccountingDocument.create({ ...baseProps(), deductiblePercentage: 50 })).toThrow(
      DeductibilityOverrideReasonRequiredError,
    );
  });

  it("aceita a percentagem quando o motivo é dado", () => {
    const doc = AccountingDocument.create({
      ...baseProps(),
      deductiblePercentage: 50,
      deductibilityOverrideReason: "Uso misto pessoal/profissional",
    });
    expect(doc.toProps().deductiblePercentage).toBe(50);
  });

  it("rejeita uma percentagem fora de 0-100", () => {
    expect(() =>
      AccountingDocument.create({ ...baseProps(), deductiblePercentage: 150, deductibilityOverrideReason: "x" }),
    ).toThrow(InvalidDeductiblePercentageError);
  });
});

describe("AccountingDocument — transições de estado", () => {
  it("validate() muda o estado para validated", () => {
    const doc = AccountingDocument.create(baseProps());
    const validated = doc.validate("manager@fonsat.pt");
    expect(validated.status).toBe("validated");
  });

  it("markWithPendency() muda o estado para with_pendency", () => {
    const doc = AccountingDocument.create(baseProps());
    const withPendency = doc.markWithPendency("manager@fonsat.pt");
    expect(withPendency.status).toBe("with_pendency");
  });

  it("cancel() exige motivo e nunca apaga o documento (soft state)", () => {
    const doc = AccountingDocument.create(baseProps());
    expect(() => doc.cancel("", "manager@fonsat.pt")).toThrow(CancellationReasonRequiredError);
    const cancelled = doc.cancel("Duplicado", "manager@fonsat.pt");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.toProps().cancellationReason).toBe("Duplicado");
  });
});

describe("AccountingDocument.update", () => {
  it("mantém a validação de override também na atualização", () => {
    const doc = AccountingDocument.create(baseProps());
    expect(() => doc.update({ deductiblePercentage: 30 }, "manager@fonsat.pt")).toThrow(
      DeductibilityOverrideReasonRequiredError,
    );
    const updated = doc.update(
      { deductiblePercentage: 30, deductibilityOverrideReason: "Correção" },
      "manager@fonsat.pt",
    );
    expect(updated.toProps().deductiblePercentage).toBe(30);
  });
});
