import { SetInvoiceStatusUseCase } from "../../application/use-cases/set-invoice-status.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

const makeInvoice = () =>
  Invoice.create({
    supplierName: "EDP",
    invoiceNumber: "EDP-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 85000,
    totalVat: 5100,
    totalWithVat: 90100,
  });

describe("SetInvoiceStatusUseCase", () => {
  let repo: FakeInvoiceRepository;
  let payableWrite: FakePayableEntryWrite;
  let useCase: SetInvoiceStatusUseCase;

  beforeEach(() => {
    repo = new FakeInvoiceRepository();
    payableWrite = new FakePayableEntryWrite();
    useCase = new SetInvoiceStatusUseCase(repo, payableWrite);
  });

  it("muda estado para overdue", async () => {
    const inv = makeInvoice();
    await repo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, status: "overdue" });
    expect(dto.status).toBe("overdue");
  });

  it("muda estado para review", async () => {
    const inv = makeInvoice();
    await repo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, status: "review" });
    expect(dto.status).toBe("review");
  });

  it("muda estado para cancelled", async () => {
    const inv = makeInvoice();
    await repo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, status: "cancelled" });
    expect(dto.status).toBe("cancelled");
  });

  it("persiste o novo estado no repositório", async () => {
    const inv = makeInvoice();
    await repo.save(ORG_ID, inv);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id, status: "overdue" });

    const saved = await repo.findById(ORG_ID, inv.id);
    expect(saved!.status).toBe("overdue");
  });

  it("lança InvoiceNotFoundError para id inexistente", async () => {
    await expect(
      useCase.execute({ organizationId: ORG_ID, id: "nao-existe", status: "overdue" }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it("cancels the linked payable entry when status is set to cancelled", async () => {
    const inv = makeInvoice();
    await repo.save(ORG_ID, inv);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id, status: "cancelled" });
    expect(payableWrite.cancelled).toContain(inv.id);
  });

  it("marks the linked payable entry as paid when status is set to paid", async () => {
    const inv = makeInvoice();
    await repo.save(ORG_ID, inv);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id, status: "paid" });
    expect(payableWrite.markedPaid).toHaveLength(1);
    expect(payableWrite.markedPaid[0]!.invoiceId).toBe(inv.id);
  });

  it("does not touch payable entry for non-synced statuses (overdue, review)", async () => {
    const inv = makeInvoice();
    await repo.save(ORG_ID, inv);

    await useCase.execute({ organizationId: ORG_ID, id: inv.id, status: "overdue" });
    await useCase.execute({ organizationId: ORG_ID, id: inv.id, status: "review" });

    expect(payableWrite.cancelled).toHaveLength(0);
    expect(payableWrite.markedPaid).toHaveLength(0);
  });
});
