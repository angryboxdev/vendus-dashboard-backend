import { Document } from "../../domain/entities/document.js";
import { documentToRow, legacyDocumentType } from "../../adapters/out/supabase-document.repository.js";

// CHECK da coluna antiga (20260822141653_remote_schema.sql): só estes valores, e nunca null.
const LEGACY = ["contract", "id_card", "nif", "iban", "other"];

describe("hr_employee_documents — coluna antiga document_type", () => {
  test("cada categoria dá um valor aceite pelo CHECK (o inverso do backfill)", () => {
    expect(legacyDocumentType("contrato_trabalho")).toBe("contract");
    expect(["cartao_cidadao", "titulo_residencia", "passaporte"].map(legacyDocumentType)).toEqual(["id_card", "id_card", "id_card"]);
    expect(legacyDocumentType("nif")).toBe("nif");
    expect(legacyDocumentType("comprovativo_iban")).toBe("iban");
    for (const c of ["recibo_vencimento", "certificado_morada", "ficha_colaborador", "certidao_permanente", "x"]) expect(LEGACY).toContain(legacyDocumentType(c));
  });

  test("a linha gravada leva sempre document_type (o envio de recibos falhava com null)", () => {
    const doc = Document.createFirstVersion({
      owner: { type: "employee", id: "e1" },
      category: "recibo_vencimento",
      mandatory: false,
      fileName: "recibo.pdf",
      storagePath: "org/e1/recibo.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      origin: "rh",
      expiresAt: null,
      period: "2026-10",
      uploadedBy: "rh@demo.invalid",
    });
    expect(documentToRow(doc)).toMatchObject({ document_type: "other", category: "recibo_vencimento", period: "2026-10" });
  });
});
