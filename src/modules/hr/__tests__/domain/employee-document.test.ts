import { EmployeeDocument } from "../../domain/entities/employee-document.js";
import { DocumentNotCurrentError } from "../../domain/errors.js";

function makeDoc(origin: "rh" | "colaborador" | "sistema" = "rh") {
  return EmployeeDocument.createFirstVersion({
    employeeId: "e1",
    category: "contrato_trabalho",
    mandatory: true,
    fileName: "contrato.pdf",
    storagePath: "e1/v1/contrato.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1000,
    origin,
    expiresAt: null,
    uploadedBy: "rh@angrybox.com",
  });
}

describe("EmployeeDocument", () => {
  it("createFirstVersion(): versão 1, atual, sem versão anterior", () => {
    const doc = makeDoc();
    expect(doc.version).toBe(1);
    expect(doc.isCurrent).toBe(true);
    expect(doc.previousVersionId).toBeNull();
    expect(doc.status).toBe("valid");
  });

  it("createFirstVersion(): origem 'colaborador' começa 'pending_validation'", () => {
    const doc = makeDoc("colaborador");
    expect(doc.status).toBe("pending_validation");
  });

  it("supersede() cria uma nova versão e NÃO apaga/altera a linha original", () => {
    const v1 = makeDoc();
    const v2 = v1.supersede({
      fileName: "contrato-v2.pdf",
      storagePath: "e1/v2/contrato-v2.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 2000,
      expiresAt: "2027-01-01",
      uploadedBy: "rh@angrybox.com",
    });
    expect(v2.version).toBe(2);
    expect(v2.previousVersionId).toBe(v1.id);
    expect(v2.isCurrent).toBe(true);
    // v1 continua intacta — a entidade é imutável, o use case é quem marca a antiga.
    expect(v1.isCurrent).toBe(true);
    expect(v1.storagePath).toBe("e1/v1/contrato.pdf");
  });

  it("markSuperseded() marca isCurrent=false sem apagar nenhum campo", () => {
    const v1 = makeDoc();
    const superseded = v1.markSuperseded();
    expect(superseded.isCurrent).toBe(false);
    expect(superseded.storagePath).toBe(v1.storagePath);
    expect(superseded.fileName).toBe(v1.fileName);
  });

  it("supersede() lança se a versão não for a atual", () => {
    const v1 = makeDoc().markSuperseded();
    expect(() =>
      v1.supersede({
        fileName: "x.pdf",
        storagePath: "x",
        mimeType: "application/pdf",
        fileSizeBytes: 1,
        expiresAt: null,
        uploadedBy: "rh@angrybox.com",
      }),
    ).toThrow(DocumentNotCurrentError);
  });

  it("remove() marca status=removed e isCurrent=false, preservando o ficheiro/linha", () => {
    const v1 = makeDoc();
    const removed = v1.remove();
    expect(removed.status).toBe("removed");
    expect(removed.isCurrent).toBe(false);
    expect(removed.storagePath).toBe(v1.storagePath);
  });

  it("remove() lança se a versão já não for a atual", () => {
    const removedOnce = makeDoc().remove();
    expect(() => removedOnce.remove()).toThrow(DocumentNotCurrentError);
  });
});
