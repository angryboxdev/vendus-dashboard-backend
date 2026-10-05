import {
  applicableCategoriesFor,
  buildDynamicRequirements,
  computeDocumentDisplayStatus,
  computeDocumentRequirementRows,
  computeMandatoryDocumentsSummary,
  computeMissingOptional,
  deriveOverallDocumentSituation,
  EXPIRING_SOON_DAYS,
} from "../../domain/services/document-status.service.js";
import { DocumentCategoryDefinition } from "../../../documents/domain/entities/document-category.js";
import type { DocumentStatus } from "../../../documents/domain/entities/document.js";
import type { JobRole } from "../../domain/entities/employee.js";

function categoryDef(overrides: {
  slug: string;
  label?: string;
  mandatory?: boolean;
  jobRoles?: JobRole[];
  active?: boolean;
}): DocumentCategoryDefinition {
  const def = DocumentCategoryDefinition.create({
    organizationId: "org-test",
    slug: overrides.slug,
    label: overrides.label ?? overrides.slug,
    mandatory: overrides.mandatory ?? false,
    jobRoles: overrides.jobRoles ?? [],
    acceptedMimeTypes: ["application/pdf"],
  });
  return overrides.active === false ? def.setActive(false) : def;
}

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
  it("requisitos sem nenhuma das categorias que os satisfazem entram em missingRequirements", () => {
    const summary = computeMandatoryDocumentsSummary(
      [
        { id: "contrato", label: "Contrato de trabalho", categories: ["contrato_trabalho"] },
        { id: "nif", label: "NIF", categories: ["nif"] },
      ],
      [doc({ category: "nif" })],
      NOW,
    );
    expect(summary.missingRequirements).toEqual(["Contrato de trabalho"]);
    expect(summary.mandatoryCompleted).toBe(1);
    expect(summary.mandatoryTotal).toBe(2);
  });

  it("um requisito com várias categorias aceitas fica cumprido com QUALQUER uma delas", () => {
    const summary = computeMandatoryDocumentsSummary(
      [
        {
          id: "identificacao",
          label: "Documento de identificação",
          categories: ["cartao_cidadao", "titulo_residencia", "passaporte"],
        },
      ],
      [doc({ category: "titulo_residencia" })],
      NOW,
    );
    expect(summary.missingRequirements).toEqual([]);
    expect(summary.mandatoryCompleted).toBe(1);
  });

  it("documento expirado/rejeitado/em validação conta como requisito por cumprir, não desaparece silenciosamente", () => {
    const summary = computeMandatoryDocumentsSummary(
      [{ id: "contrato", label: "Contrato de trabalho", categories: ["contrato_trabalho"] }],
      [doc({ category: "contrato_trabalho", status: "rejected" })],
      NOW,
    );
    expect(summary.missingRequirements).toEqual(["Contrato de trabalho"]);
    expect(summary.mandatoryCompleted).toBe(0);
  });

  it("conta expiringSoonCount mesmo para categorias não obrigatórias", () => {
    const soon = new Date(NOW.getTime() + 5 * 86400000).toISOString();
    const summary = computeMandatoryDocumentsSummary(
      [{ id: "contrato", label: "Contrato de trabalho", categories: ["contrato_trabalho"] }],
      [doc({ category: "contrato_trabalho" }), doc({ category: "iban", expiresAt: soon })],
      NOW,
    );
    expect(summary.expiringSoonCount).toBe(1);
  });
});

describe("deriveOverallDocumentSituation", () => {
  it("'missing' tem prioridade sobre 'expiring'", () => {
    expect(
      deriveOverallDocumentSituation({ mandatoryTotal: 2, mandatoryCompleted: 1, missingRequirements: ["NIF"], expiringSoonCount: 1 }),
    ).toBe("missing");
  });

  it("'expiring' quando nada falta mas algo expira em breve", () => {
    expect(
      deriveOverallDocumentSituation({ mandatoryTotal: 1, mandatoryCompleted: 1, missingRequirements: [], expiringSoonCount: 1 }),
    ).toBe("expiring");
  });

  it("'ok' quando nada falta e nada expira em breve", () => {
    expect(
      deriveOverallDocumentSituation({ mandatoryTotal: 1, mandatoryCompleted: 1, missingRequirements: [], expiringSoonCount: 0 }),
    ).toBe("ok");
  });
});

describe("applicableCategoriesFor", () => {
  it("inclui categorias sem restrição de cargo (jobRoles vazio)", () => {
    const defs = [categoryDef({ slug: "a", jobRoles: [] })];
    expect(applicableCategoriesFor(defs, "service").map((d) => d.slug)).toEqual(["a"]);
  });

  it("só inclui categorias cujo jobRoles inclui o cargo do colaborador", () => {
    const defs = [categoryDef({ slug: "a", jobRoles: ["manager"] }), categoryDef({ slug: "b", jobRoles: ["service", "prep"] })];
    expect(applicableCategoriesFor(defs, "service").map((d) => d.slug)).toEqual(["b"]);
    expect(applicableCategoriesFor(defs, "manager").map((d) => d.slug)).toEqual(["a"]);
  });

  it("exclui categorias desativadas mesmo que o cargo aplique", () => {
    const defs = [categoryDef({ slug: "a", active: false })];
    expect(applicableCategoriesFor(defs, "service")).toEqual([]);
  });
});

describe("buildDynamicRequirements", () => {
  it("converte só as categorias obrigatórias, uma por requisito", () => {
    const applicable = [
      categoryDef({ slug: "a", label: "A", mandatory: true }),
      categoryDef({ slug: "b", label: "B", mandatory: false }),
    ];
    expect(buildDynamicRequirements(applicable)).toEqual([{ id: "a", label: "A", categories: ["a"] }]);
  });
});

describe("computeMissingOptional", () => {
  it("categoria opcional sem documento aparece na lista", () => {
    const applicable = [categoryDef({ slug: "certificado_morada", label: "Certificado de morada", mandatory: false })];
    expect(computeMissingOptional(applicable, [], NOW)).toEqual(["Certificado de morada"]);
  });

  it("categoria opcional com documento 'ok' não aparece na lista", () => {
    const applicable = [categoryDef({ slug: "certificado_morada", label: "Certificado de morada", mandatory: false })];
    expect(computeMissingOptional(applicable, [doc({ category: "certificado_morada" })], NOW)).toEqual([]);
  });

  it("nunca inclui categorias obrigatórias", () => {
    const applicable = [categoryDef({ slug: "contrato_trabalho", label: "Contrato de trabalho", mandatory: true })];
    expect(computeMissingOptional(applicable, [], NOW)).toEqual([]);
  });
});

describe("computeDocumentRequirementRows", () => {
  it("sem documento nenhum: identificação + cada categoria aplicável aparecem como 'missing'", () => {
    const applicable = [categoryDef({ slug: "contrato_trabalho", label: "Contrato de trabalho", mandatory: true })];
    const rows = computeDocumentRequirementRows(applicable, [], NOW);
    expect(rows).toEqual([
      { requirementId: "identificacao", requirementLabel: "Documento de identificação", mandatory: true, status: "missing", expiresAt: null, documentId: null },
      { requirementId: "contrato_trabalho", requirementLabel: "Contrato de trabalho", mandatory: true, status: "missing", expiresAt: null, documentId: null },
    ]);
  });

  it("categoria opcional também aparece (ao contrário de computeMandatoryDocumentsSummary, que só lista obrigatórias)", () => {
    const applicable = [categoryDef({ slug: "certificado_morada", label: "Certificado de morada", mandatory: false })];
    const rows = computeDocumentRequirementRows(applicable, [], NOW);
    const row = rows.find((r) => r.requirementId === "certificado_morada");
    expect(row).toEqual({ requirementId: "certificado_morada", requirementLabel: "Certificado de morada", mandatory: false, status: "missing", expiresAt: null, documentId: null });
  });

  it("documento 'ok' aparece com o seu id e validade", () => {
    const applicable = [categoryDef({ slug: "contrato_trabalho", label: "Contrato de trabalho", mandatory: true })];
    const currentDoc = { id: "doc-1", category: "contrato_trabalho", status: "valid" as DocumentStatus, expiresAt: "2027-01-01", isCurrent: true };
    const rows = computeDocumentRequirementRows(applicable, [currentDoc], NOW);
    const row = rows.find((r) => r.requirementId === "contrato_trabalho");
    expect(row).toEqual({ requirementId: "contrato_trabalho", requirementLabel: "Contrato de trabalho", mandatory: true, status: "ok", expiresAt: "2027-01-01", documentId: "doc-1" });
  });

  it("documento 'a expirar'/'expirado' mantém o estado real (não vira 'ok' nem 'missing')", () => {
    const applicable = [categoryDef({ slug: "contrato_trabalho", label: "Contrato de trabalho", mandatory: true })];
    const expiring = { id: "doc-1", category: "contrato_trabalho", status: "valid" as DocumentStatus, expiresAt: "2026-06-20", isCurrent: true };
    const expired = { id: "doc-2", category: "contrato_trabalho", status: "valid" as DocumentStatus, expiresAt: "2026-01-01", isCurrent: true };
    expect(computeDocumentRequirementRows(applicable, [expiring], NOW).find((r) => r.requirementId === "contrato_trabalho")?.status).toBe("expiring");
    expect(computeDocumentRequirementRows(applicable, [expired], NOW).find((r) => r.requirementId === "contrato_trabalho")?.status).toBe("expired");
  });

  it("documento 'pending_validation'/'rejected' conta como 'missing' nesta vista agregada (simplificação documentada), mas mantém o documentId (há algo para 'Ver', não é um 'Adicionar' do zero)", () => {
    const applicable = [categoryDef({ slug: "contrato_trabalho", label: "Contrato de trabalho", mandatory: true })];
    const pending = { id: "doc-1", category: "contrato_trabalho", status: "pending_validation" as DocumentStatus, expiresAt: null, isCurrent: true };
    const row = computeDocumentRequirementRows(applicable, [pending], NOW).find((r) => r.requirementId === "contrato_trabalho");
    expect(row?.status).toBe("missing");
    expect(row?.documentId).toBe("doc-1");
  });

  it("identificação é satisfeita por qualquer uma das 3 categorias (cartão de cidadão OU título de residência OU passaporte)", () => {
    const passaporte = { id: "doc-1", category: "passaporte", status: "valid" as DocumentStatus, expiresAt: null, isCurrent: true };
    const row = computeDocumentRequirementRows([], [passaporte], NOW).find((r) => r.requirementId === "identificacao");
    expect(row).toEqual({ requirementId: "identificacao", requirementLabel: "Documento de identificação", mandatory: true, status: "ok", expiresAt: null, documentId: "doc-1" });
  });
});
