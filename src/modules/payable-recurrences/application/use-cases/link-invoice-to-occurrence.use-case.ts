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

    // Documento de pagamento com várias faturas (ex.: águas + resíduos): a ocorrência fica ligada a
    // esta fatura, mas conta o documento inteiro — um só pagamento, real = soma das faturas.
    const group = (await this.invoiceRead.findPaymentGroupMembers(command.organizationId, [invoice.id])).get(invoice.id) ?? [];
    const members = group.some((m) => m.id === invoice.id) ? group : [invoice];

    // Enforce 1:1 — nenhuma fatura do documento pode já estar noutra ocorrência
    for (const m of members) {
      const existing = await this.occurrenceRepo.findAll(command.organizationId, { invoiceId: m.id });
      if (existing.some((o) => o.id !== command.occurrenceId)) throw new InvoiceAlreadyLinkedError(m.id);
    }

    const realAmountCents = members.reduce((sum, m) => sum + m.totalWithVatCents, 0);
    let updated = occurrence.linkInvoice(invoice.id, realAmountCents);

    // Se todas as faturas do documento já foram pagas, marcar a ocorrência como paga também
    if (members.every((m) => m.status === "paid" && m.paidAt)) {
      const lastPaidAt = members.map((m) => m.paidAt!).sort().at(-1)!;
      updated = updated.markPaid(new Date(lastPaidAt));
    }

    await this.occurrenceRepo.update(command.organizationId, updated);
    return toOccurrenceDTO(updated);
  }
}
