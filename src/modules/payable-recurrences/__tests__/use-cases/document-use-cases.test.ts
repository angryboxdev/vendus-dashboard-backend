import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateRecurrenceUseCase } from "../../application/use-cases/create-recurrence.use-case.js";
import { CloseRecurrenceUseCase } from "../../application/use-cases/close-recurrence.use-case.js";
import { UploadRecurrenceDocumentUseCase } from "../../application/use-cases/upload-recurrence-document.use-case.js";
import { DeleteRecurrenceDocumentUseCase } from "../../application/use-cases/delete-recurrence-document.use-case.js";
import { GenerateOccurrenceUseCase } from "../../application/use-cases/generate-occurrence.use-case.js";
import { UploadOccurrenceDocumentUseCase } from "../../application/use-cases/upload-occurrence-document.use-case.js";
import { DeleteOccurrenceDocumentUseCase } from "../../application/use-cases/delete-occurrence-document.use-case.js";
import { FakeRecurrenceRepository } from "../fakes/fake-recurrence-repository.js";
import { FakeOccurrenceRepository } from "../fakes/fake-occurrence-repository.js";
import { FakeDocumentStorage } from "../fakes/fake-document-storage.js";
import { RecurrenceNotFoundError, OccurrenceNotFoundError, RecurrenceClosedError } from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");

const FAKE_BUFFER = Buffer.from("fake-pdf-content");

const BASE_REC = {
  organizationId,
  name: "Renda",
  supplierName: "Proprietário Lda",
  type: "fixed_contract" as const,
  estimatedAmountCents: 120000,
  dayOfMonth: 5,
  startDate: "2026-01-01",
  paymentMethod: "transfer" as const,
};

function make() {
  const recurrenceRepo = new FakeRecurrenceRepository();
  const occurrenceRepo = new FakeOccurrenceRepository();
  const storage = new FakeDocumentStorage();
  return {
    recurrenceRepo,
    occurrenceRepo,
    storage,
    createRec: new CreateRecurrenceUseCase(recurrenceRepo),
    closeRec: new CloseRecurrenceUseCase(recurrenceRepo),
    generateOcc: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    uploadRec: new UploadRecurrenceDocumentUseCase(recurrenceRepo, storage),
    deleteRec: new DeleteRecurrenceDocumentUseCase(recurrenceRepo, storage),
    uploadOcc: new UploadOccurrenceDocumentUseCase(occurrenceRepo, storage),
    deleteOcc: new DeleteOccurrenceDocumentUseCase(occurrenceRepo, storage),
  };
}

// ── Recurrence document ──────────────────────────────────────────────────────

describe("UploadRecurrenceDocumentUseCase", () => {
  it("faz upload e persiste a URL no documentUrl da recorrência", async () => {
    const { createRec, uploadRec, storage } = make();
    const rec = await createRec.execute(BASE_REC);
    expect(rec.documentUrl).toBeNull();

    const updated = await uploadRec.execute({
      organizationId,
      recurrenceId: rec.id,
      buffer: FAKE_BUFFER,
      filename: "contrato.pdf",
      mimeType: "application/pdf",
    });

    expect(updated.documentUrl).not.toBeNull();
    expect(storage.stored).toHaveLength(1);
    expect(storage.stored[0]!.filename).toBe("contrato.pdf");
  });

  it("elimina o documento anterior antes de fazer upload do novo", async () => {
    const { createRec, uploadRec, storage } = make();
    const rec = await createRec.execute(BASE_REC);

    const first = await uploadRec.execute({
      organizationId,
      recurrenceId: rec.id,
      buffer: FAKE_BUFFER,
      filename: "v1.pdf",
      mimeType: "application/pdf",
    });

    await uploadRec.execute({
      organizationId,
      recurrenceId: rec.id,
      buffer: FAKE_BUFFER,
      filename: "v2.pdf",
      mimeType: "application/pdf",
    });

    expect(storage.deleted).toHaveLength(1);
    expect(storage.deleted[0]).toBe(first.documentUrl);
    expect(storage.stored).toHaveLength(2);
  });

  it("lança RecurrenceNotFoundError para id inexistente", async () => {
    const { uploadRec } = make();
    await expect(
      uploadRec.execute({
        organizationId,
        recurrenceId: "nao-existe",
        buffer: FAKE_BUFFER,
        filename: "f.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(RecurrenceNotFoundError);
  });

  it("lança RecurrenceNotFoundError para uma recorrência que pertence a outra organização", async () => {
    const { createRec, uploadRec } = make();
    const rec = await createRec.execute(BASE_REC);
    const otherOrganizationId = mintOrganizationId("org-b");

    await expect(
      uploadRec.execute({
        organizationId: otherOrganizationId,
        recurrenceId: rec.id,
        buffer: FAKE_BUFFER,
        filename: "f.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(RecurrenceNotFoundError);
  });

  it("lança RecurrenceClosedError ao fazer upload numa recorrência fechada", async () => {
    const { createRec, closeRec, uploadRec } = make();
    const rec = await createRec.execute(BASE_REC);
    await closeRec.execute({ organizationId, id: rec.id });

    await expect(
      uploadRec.execute({
        organizationId,
        recurrenceId: rec.id,
        buffer: FAKE_BUFFER,
        filename: "f.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(RecurrenceClosedError);
  });
});

describe("DeleteRecurrenceDocumentUseCase", () => {
  it("remove o documento e limpa documentUrl", async () => {
    const { createRec, uploadRec, deleteRec, storage } = make();
    const rec = await createRec.execute(BASE_REC);
    await uploadRec.execute({
      organizationId,
      recurrenceId: rec.id,
      buffer: FAKE_BUFFER,
      filename: "f.pdf",
      mimeType: "application/pdf",
    });

    const updated = await deleteRec.execute({ organizationId, recurrenceId: rec.id });

    expect(updated.documentUrl).toBeNull();
    expect(storage.deleted).toHaveLength(1);
  });

  it("não falha se documentUrl já é null (idempotente)", async () => {
    const { createRec, deleteRec, storage } = make();
    const rec = await createRec.execute(BASE_REC);

    const updated = await deleteRec.execute({ organizationId, recurrenceId: rec.id });

    expect(updated.documentUrl).toBeNull();
    expect(storage.deleted).toHaveLength(0); // nada a apagar
  });

  it("lança RecurrenceNotFoundError para id inexistente", async () => {
    const { deleteRec } = make();
    await expect(deleteRec.execute({ organizationId, recurrenceId: "nao-existe" })).rejects.toThrow(
      RecurrenceNotFoundError,
    );
  });
});

// ── Occurrence document ───────────────────────────────────────────────────────

describe("UploadOccurrenceDocumentUseCase", () => {
  it("faz upload e persiste a URL no documentUrl da ocorrência", async () => {
    const { createRec, generateOcc, uploadOcc, storage } = make();
    const rec = await createRec.execute(BASE_REC);
    const occ = await generateOcc.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });
    expect(occ.documentUrl).toBeNull();

    const updated = await uploadOcc.execute({
      organizationId,
      occurrenceId: occ.id,
      buffer: FAKE_BUFFER,
      filename: "fatura-julho.pdf",
      mimeType: "application/pdf",
    });

    expect(updated.documentUrl).not.toBeNull();
    expect(storage.stored).toHaveLength(1);
  });

  it("substitui documento anterior ao fazer novo upload", async () => {
    const { createRec, generateOcc, uploadOcc, storage } = make();
    const rec = await createRec.execute(BASE_REC);
    const occ = await generateOcc.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });

    const first = await uploadOcc.execute({
      organizationId,
      occurrenceId: occ.id,
      buffer: FAKE_BUFFER,
      filename: "v1.pdf",
      mimeType: "application/pdf",
    });

    await uploadOcc.execute({
      organizationId,
      occurrenceId: occ.id,
      buffer: FAKE_BUFFER,
      filename: "v2.pdf",
      mimeType: "application/pdf",
    });

    expect(storage.deleted).toHaveLength(1);
    expect(storage.deleted[0]).toBe(first.documentUrl);
  });

  it("lança OccurrenceNotFoundError para id inexistente", async () => {
    const { uploadOcc } = make();
    await expect(
      uploadOcc.execute({
        organizationId,
        occurrenceId: "nao-existe",
        buffer: FAKE_BUFFER,
        filename: "f.pdf",
        mimeType: "application/pdf",
      }),
    ).rejects.toThrow(OccurrenceNotFoundError);
  });
});

describe("DeleteOccurrenceDocumentUseCase", () => {
  it("remove o documento e limpa documentUrl da ocorrência", async () => {
    const { createRec, generateOcc, uploadOcc, deleteOcc, storage } = make();
    const rec = await createRec.execute(BASE_REC);
    const occ = await generateOcc.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });
    await uploadOcc.execute({
      organizationId,
      occurrenceId: occ.id,
      buffer: FAKE_BUFFER,
      filename: "f.pdf",
      mimeType: "application/pdf",
    });

    const updated = await deleteOcc.execute({ organizationId, occurrenceId: occ.id });

    expect(updated.documentUrl).toBeNull();
    expect(storage.deleted).toHaveLength(1);
  });

  it("não falha se documentUrl já é null (idempotente)", async () => {
    const { createRec, generateOcc, deleteOcc, storage } = make();
    const rec = await createRec.execute(BASE_REC);
    const occ = await generateOcc.execute({ organizationId, recurrenceId: rec.id, year: 2026, month: 7 });

    const updated = await deleteOcc.execute({ organizationId, occurrenceId: occ.id });

    expect(updated.documentUrl).toBeNull();
    expect(storage.deleted).toHaveLength(0);
  });

  it("lança OccurrenceNotFoundError para id inexistente", async () => {
    const { deleteOcc } = make();
    await expect(deleteOcc.execute({ organizationId, occurrenceId: "nao-existe" })).rejects.toThrow(
      OccurrenceNotFoundError,
    );
  });
});
