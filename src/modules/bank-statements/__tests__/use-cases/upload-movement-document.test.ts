import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { UploadMovementDocumentUseCase } from "../../application/use-cases/upload-movement-document.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeDocumentStorage } from "../fakes/fake-document-storage.js";
import { MovementNotFoundError } from "../../domain/errors.js";

function makeMovement() {
  return BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-07-01"),
    valueDate: new Date("2026-07-01"),
    description: "PAGAMENTO REFERENCIA",
    amount: 14_64,
    balanceAfter: 348_932,
    movementType: "debit",
    deduplicationHash: "hash-upload-1",
  });
}

describe("UploadMovementDocumentUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let repo: FakeBankMovementRepository;
  let storage: FakeDocumentStorage;
  let useCase: UploadMovementDocumentUseCase;
  let movement: BankMovement;

  beforeEach(async () => {
    repo = new FakeBankMovementRepository();
    storage = new FakeDocumentStorage();
    useCase = new UploadMovementDocumentUseCase(repo, storage);
    movement = makeMovement();
    await repo.saveBulk(organizationId, [movement]);
  });

  it("throws MovementNotFoundError for unknown id", async () => {
    await expect(
      useCase.execute({
        organizationId,
        movementId: "not-found",
        buffer: Buffer.from("pdf"),
        filename: "fatura.pdf",
        mimeType: "application/pdf",
      })
    ).rejects.toThrow(MovementNotFoundError);
  });

  it("uploads file to storage and returns the URL", async () => {
    storage.setNextUrl("https://storage.example.com/fatura.pdf");

    const result = await useCase.execute({
      organizationId,
      movementId: movement.id,
      buffer: Buffer.from("pdf-content"),
      filename: "fatura.pdf",
      mimeType: "application/pdf",
    });

    expect(result.documentUrl).toBe("https://storage.example.com/fatura.pdf");
  });

  it("passes filename and mimeType to storage", async () => {
    await useCase.execute({
      organizationId,
      movementId: movement.id,
      buffer: Buffer.from("img"),
      filename: "comprovativo.jpg",
      mimeType: "image/jpeg",
    });

    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0]!.filename).toBe("comprovativo.jpg");
    expect(storage.uploads[0]!.mimeType).toBe("image/jpeg");
  });

  it("does not change movement reconciliation status", async () => {
    const before = await repo.findById(organizationId, movement.id);
    expect(before?.reconciliationStatus).toBe("saida_nao_justificada");

    await useCase.execute({
      organizationId,
      movementId: movement.id,
      buffer: Buffer.from("pdf"),
      filename: "doc.pdf",
      mimeType: "application/pdf",
    });

    const after = await repo.findById(organizationId, movement.id);
    expect(after?.reconciliationStatus).toBe("saida_nao_justificada");
  });
});
