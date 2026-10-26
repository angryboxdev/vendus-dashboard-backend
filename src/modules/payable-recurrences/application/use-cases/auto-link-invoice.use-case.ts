import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import type { InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";
import type {
  AutoLinkInvoicePort,
  AutoLinkInvoiceResult,
  InvoiceQuery,
  LinkInvoiceToRecurrencePort,
} from "../../domain/ports/in/invoice-link.ports.js";
import { findDocumentLink, isInvoiceEligibleForAutoLink, resolveInvoiceCandidates } from "./invoice-candidates.js";

/**
 * Fatura lançada → recorrência (pedido do utilizador, 2026-10-26): com um único
 * candidato associa logo (o previsto passa a real); com vários não adivinha — a
 * fatura mostra as sugestões e o utilizador escolhe. Num documento de pagamento com
 * várias faturas, o documento conta como um só (associado uma vez, real = soma).
 */
export class AutoLinkInvoiceUseCase implements AutoLinkInvoicePort {
  constructor(
    private readonly recurrenceRepo: RecurrenceRepositoryPort,
    private readonly occurrenceRepo: OccurrenceRepositoryPort,
    private readonly invoiceRead: InvoiceReadPort,
    private readonly linkToRecurrence: LinkInvoiceToRecurrencePort,
  ) {}

  async execute(query: InvoiceQuery): Promise<AutoLinkInvoiceResult> {
    const none: AutoLinkInvoiceResult = { outcome: "none", occurrenceId: null, candidateCount: 0 };
    const invoice = await this.invoiceRead.findById(query.organizationId, query.invoiceId);
    if (!invoice || !isInvoiceEligibleForAutoLink(invoice)) return none;

    const members = (await this.invoiceRead.findPaymentGroupMembers(query.organizationId, [invoice.id])).get(invoice.id) ?? [invoice];
    const already = await findDocumentLink(query.organizationId, members, this.occurrenceRepo);
    if (already) return { outcome: "already_linked", occurrenceId: already.id, candidateCount: 0 };

    const candidates = await resolveInvoiceCandidates(query.organizationId, members, this.recurrenceRepo, this.occurrenceRepo);
    // Associa sozinho só com um único candidato encontrado pelo fornecedor; por categoria + nome só sugere.
    if (candidates.length !== 1 || candidates[0]!.matchedBy !== "supplier") {
      return { outcome: candidates.length ? "suggested" : "none", occurrenceId: null, candidateCount: candidates.length };
    }

    const only = candidates[0]!;
    const linked = await this.linkToRecurrence.execute({
      organizationId: query.organizationId,
      invoiceId: invoice.id,
      recurrenceId: only.recurrence.id,
      period: only.period,
    });
    return { outcome: "linked", occurrenceId: linked.id, candidateCount: 1 };
  }
}
