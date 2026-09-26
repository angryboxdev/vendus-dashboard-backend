import {
  computeDocumentDisplayStatus,
  computeMandatoryDocumentsSummary,
  deriveOverallDocumentSituation,
  EXPIRING_SOON_DAYS,
} from "../../domain/services/document-status.service.js";
import type { DocumentStatus } from "../../domain/entities/employee-document.js";

const NOW = new Date("2026-06-15T12:00:00.000Z");

interface DocLike {
  status: DocumentStatus;
  expiresAt: string | null;
  isCurrent: boolean;
  category: string;
}

function doc(overrides: Partial<DocLike> = {}): DocLike {
  return {
    status: "valid",
    expiresAt: null,
    isCurrent: true,
    category: "contrato_trabalho",
    ...overrides,
  };
}

describe("computeDocumentDisplayStatus", () => {
  it("'ok' quando válido sem data de validade", () => {
    expect(computeDocumentDisplayStatus(doc(), NOW)).toBe("ok");
  });

  it("'expiring' quando expira dentro do threshold", () => {
    const soon = new Date(NOW.getTime() + (EXPIRING_SOON_DAYS - 1) * 86400000).toISOString();
    expect(computeDocumentDisplayStatus(doc({ expiresAt: soon }), NOW)).toBe("expiring");
  });

  it("'expired' quando a data de validade já passou", () => {
    const past = new Date(NOW.getTime() - 86400000).toISOString();
    expect(computeDocumentDisplayStatus(doc({ expiresAt: past }), NOW)).toBe("expired");
  });

  it("'ok' quando expira muito depois do threshold", () => {
    const far = new Date(NOW.getTime() + (EXPIRING_SOON_DAYS + 10) * 86400000).toISOString();
    expect(computeDocumentDisplayStatus(doc({ expiresAt: far }), NOW)).toBe("ok");
  });

  it("'pending_validation' tem prioridade sobre a data de validade", () => {
    expect(computeDocumentDisplayStatus(doc({ status: "pending_validation" }), NOW)).toBe("pending_validation");
  });

  it("'rejected'", () => {
    expect(computeDocumentDisplayStatus(doc({ status: "rejected" }), NOW)).toBe("rejected");
  });

  it("'removed' quando isCurrent=false, mesmo que status ainda diga 'valid'", () => {
    expect(computeDocumentDisplayStatus(doc({ isCurrent: false }), NOW)).toBe("removed");
  });
});

describe("computeMandatoryDocumentsSummary", () => {
  it("categorias sem documento entram em missingCategories", () => {
    const summary = computeMandatoryDocumentsSummary(["contrato_trabalho", "nif"], [doc({ category: "nif" })], NOW);
    expect(summary.missingCategories).toEqual(["contrato_trabalho"]);
    expect(summary.mandatoryCompleted).toBe(1);
    expect(summary.mandatoryTotal).toBe(2);
  });

  it("conta expiringSoonCount mesmo para categorias não obrigatórias", () => {
    const soon = new Date(NOW.getTime() + 5 * 86400000).toISOString();
    const summary = computeMandatoryDocumentsSummary(
      ["contrato_trabalho"],
      [doc({ category: "contrato_trabalho" }), doc({ category: "iban", expiresAt: soon })],
      NOW,
    );
    expect(summary.expiringSoonCount).toBe(1);
  });
});

describe("deriveOverallDocumentSituation", () => {
  it("'missing' tem prioridade sobre 'expiring'", () => {
    expect(
      deriveOverallDocumentSituation({ mandatoryTotal: 2, mandatoryCompleted: 1, missingCategories: ["nif"], expiringSoonCount: 1 }),
    ).toBe("missing");
  });

  it("'expiring' quando nada falta mas algo expira em breve", () => {
    expect(
      deriveOverallDocumentSituation({ mandatoryTotal: 1, mandatoryCompleted: 1, missingCategories: [], expiringSoonCount: 1 }),
    ).toBe("expiring");
  });

  it("'ok' quando nada falta e nada expira em breve", () => {
    expect(
      deriveOverallDocumentSituation({ mandatoryTotal: 1, mandatoryCompleted: 1, missingCategories: [], expiringSoonCount: 0 }),
    ).toBe("ok");
  });
});
