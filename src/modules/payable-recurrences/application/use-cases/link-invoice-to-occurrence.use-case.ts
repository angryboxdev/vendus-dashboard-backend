import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";
import type { LinkInvoiceToOccurrencePort, LinkInvoiceCommand, OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import { OccurrenceNotFoundError, InvoiceAlreadyLinkedError } from "../../domain/errors.js";
import { toOccurrenceDTO } from "./shared.js";

export class LinkInvoiceToOccurrenceUseCase implements LinkInvoiceToOccurrencePort {
  constructor(
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
    private readonly invoiceRead: InvoiceReadPort,
  ) {}

  async execute(command: LinkInvoiceCommand): Promise<OccurrenceDTO> {
    const occurrence = await this.occurrenceRepo.findById(command.organizationId, command.occurrenceId);
    if (!occurrence) throw new OccurrenceNotFoundError(command.occurrenceId);

    const invoice = await this.invoiceRead.findById(command.organizationId, command.invoiceId);
    if (!invoice) throw new Error(`Invoice "${command.invoiceId}" not found`);

    // Enforce 1:1 — a invoice can only be linked to one occurrence
    const existing = await this.occurrenceRepo.findAll(command.organizationId, { invoiceId: command.invoiceId });
    const alreadyLinked = existing.find((o) => o.id !== command.occurrenceId);
    if (alreadyLinked) throw new InvoiceAlreadyLinkedError(command.invoiceId);

    let updated = occurrence.linkInvoice(invoice.id, invoice.totalWithVatCents);

    // Se a fatura já foi completamente paga, marcar a ocorrência como paga também
    if (invoice.status === "paid" && invoice.paidAt) {
      updated = updated.markPaid(new Date(invoice.paidAt));
    }

    await this.occurrenceRepo.update(command.organizationId, updated);
    return toOccurrenceDTO(updated);
  }
}
