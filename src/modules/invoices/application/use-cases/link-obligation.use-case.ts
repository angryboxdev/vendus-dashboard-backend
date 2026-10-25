import { InvoiceNotFoundError, NotAPaymentDocumentError, ObligationLinkMismatchError } from "../../domain/errors.js";
import type { InvoiceDTO } from "../../domain/ports/in/invoice.ports.js";
import type { LinkObligationCommand, LinkObligationPort, ReadPaymentDocumentPort } from "../../domain/ports/in/payment-document.ports.js";
import type { DocumentStoragePort } from "../../domain/ports/out/document-storage.port.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceAuditPort } from "../../domain/ports/out/invoice-audit.port.js";
import { toInvoiceDTO } from "./shared.js";
import { auditSnapshot } from "./shared-audit.js";

/**
 * Ligar um documento de cobrança (Finanças / Segurança Social) a um registo que já existe —
 * tipicamente a mesma obrigação lançada antes como fatura. O servidor volta a ler o documento e só
 * aceita um registo que a procura de obrigações aponta como parecido. O registo passa a obrigação
 * (tipo, referência, entidade, período) e fica com o PDF se ainda não tinha anexo. Valores, número
 * e conta a pagar não mudam (nada é criado nem duplicado).
 */
export class LinkObligationUseCase implements LinkObligationPort {
  constructor(
    private readonly readPaymentDocument: ReadPaymentDocumentPort,
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly storage: DocumentStoragePort,
    private readonly audit: InvoiceAuditPort,
  ) {}

  async execute(command: LinkObligationCommand): Promise<InvoiceDTO> {
    const read = await this.readPaymentDocument.execute(command.organizationId, { buffer: command.fileBuffer, mimeType: command.mimeType });
    if (!read) throw new NotAPaymentDocumentError();
    const invoice = await this.invoiceRepo.findById(command.organizationId, command.invoiceId);
    if (!invoice) throw new InvoiceNotFoundError(command.invoiceId);
    if (!read.matches.some((m) => m.existing.invoiceId === invoice.id)) throw new ObligationLinkMismatchError();

    const p = read.payment;
    const attachmentUrl = invoice.attachmentUrl ?? (await this.storage.store(command.fileBuffer, command.filename, command.mimeType, command.organizationId));
    const linked = invoice.linkObligation(
      { kind: p.obligationType === "obrigacao_fiscal" ? "tax_obligation" : "contribution_obligation", paymentReference: p.paymentReference, mbEntity: p.mbEntity, period: p.period },
      attachmentUrl,
    );
    await this.invoiceRepo.update(command.organizationId, linked);
    await this.audit.record(command.organizationId, {
      invoiceId: invoice.id,
      action: "update",
      actor: command.actor,
      origin: "import",
      reason: "Ligado ao documento de cobrança (obrigação)",
      before: auditSnapshot(invoice),
      after: auditSnapshot(linked),
    });
    return toInvoiceDTO(linked);
  }
}
