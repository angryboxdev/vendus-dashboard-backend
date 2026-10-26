import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";
import type {
  GetInvoiceRecurrenceStatusPort,
  InvoiceQuery,
  InvoiceRecurrenceStatusDTO,
} from "../../domain/ports/in/invoice-link.ports.js";
import { findDocumentLink, resolveInvoiceCandidates } from "./invoice-candidates.js";
import { toOccurrenceDTO } from "./shared.js";

/**
 * Para a fatura: a que recorrência está associada (ela ou outra fatura do mesmo documento de
 * pagamento) ou, se não estiver, as sugestões. O desvio compara o previsto com o documento inteiro.
 */
export class GetInvoiceRecurrenceStatusUseCase implements GetInvoiceRecurrenceStatusPort {
  constructor(
    private readonly recurrenceRepo: RecurrenceRepositoryPort,
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
    private readonly invoiceRead: InvoiceReadPort,
  ) {}

  async execute(query: InvoiceQuery): Promise<InvoiceRecurrenceStatusDTO> {
    const invoice = await this.invoiceRead.findById(query.organizationId, query.invoiceId);
    const members = invoice
      ? (await this.invoiceRead.findPaymentGroupMembers(query.organizationId, [invoice.id])).get(invoice.id) ?? [invoice]
      : [];

    const linkedOcc = invoice
      ? await findDocumentLink(query.organizationId, members, this.occurrenceRepo)
      : (await this.occurrenceRepo.findAll(query.organizationId, { invoiceId: query.invoiceId }))[0] ?? null;
    if (linkedOcc) {
      const rec = await this.recurrenceRepo.findById(query.organizationId, linkedOcc.recurrenceId);
      return { linked: { occurrence: toOccurrenceDTO(linkedOcc), recurrenceName: rec?.name ?? "—" }, candidates: [] };
    }

    if (!invoice || invoice.documentType === "credit_note") return { linked: null, candidates: [] };

    const documentTotal = members.reduce((sum, m) => sum + m.totalWithVatCents, 0);
    const resolved = await resolveInvoiceCandidates(query.organizationId, members, this.recurrenceRepo, this.occurrenceRepo);
    return {
      linked: null,
      candidates: resolved.map((c) => {
        const estimated = c.occurrence?.estimatedAmountCents ?? c.recurrence.estimatedAmountCents;
        return {
          recurrenceId: c.recurrence.id,
          recurrenceName: c.recurrence.name,
          matchedBy: c.matchedBy,
          supplierName: c.recurrence.supplierName,
          period: c.period,
          occurrenceId: c.occurrence?.id ?? null,
          estimatedAmountCents: estimated,
          deviationPercent: estimated > 0 ? Math.round(((documentTotal - estimated) / estimated) * 1000) / 10 : null,
        };
      }),
    };
  }
}
