import type {
  ConfirmImportedInvoiceCommand,
  ConfirmImportedInvoicePort,
  CreateInvoiceCommand,
  CreateInvoicePort,
  DeleteInvoiceCommand,
  DeleteInvoicePort,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { RecurrenceLinkPort } from "../../domain/ports/out/recurrence-link.port.js";

/**
 * Associação automática fatura → recorrência depois de a fatura ficar lançada
 * (criação manual ou confirmação da importação). Nunca falha o lançamento: um erro
 * aqui só fica no log — a fatura mostra as sugestões e pode associar-se à mão.
 */
async function autoLinkQuietly(links: RecurrenceLinkPort, organizationId: CreateInvoiceCommand["organizationId"], dto: InvoiceDTO): Promise<void> {
  try {
    await links.autoLinkInvoice(organizationId, dto.id);
  } catch (e) {
    console.error("[invoices] falha na associação automática à recorrência (ignorada):", e);
  }
}

export class CreateInvoiceWithRecurrenceLink implements CreateInvoicePort {
  constructor(private readonly inner: CreateInvoicePort, private readonly links: RecurrenceLinkPort) {}

  async execute(command: CreateInvoiceCommand): Promise<InvoiceDTO> {
    const dto = await this.inner.execute(command);
    await autoLinkQuietly(this.links, command.organizationId, dto);
    return dto;
  }
}

export class ConfirmImportedInvoiceWithRecurrenceLink implements ConfirmImportedInvoicePort {
  constructor(private readonly inner: ConfirmImportedInvoicePort, private readonly links: RecurrenceLinkPort) {}

  async execute(command: ConfirmImportedInvoiceCommand): Promise<InvoiceDTO> {
    const dto = await this.inner.execute(command);
    await autoLinkQuietly(this.links, command.organizationId, dto);
    return dto;
  }
}

/**
 * Fatura apagada: a ocorrência não paga deixa de mostrar o valor «real» de uma fatura que já não
 * existe (ou, num documento de pagamento, passa a contar só as faturas que restam). O grupo é lido
 * antes de apagar — depois já não há fatura para o dizer.
 */
export class DeleteInvoiceWithRecurrenceRelease implements DeleteInvoicePort {
  constructor(
    private readonly inner: DeleteInvoicePort,
    private readonly links: RecurrenceLinkPort,
    private readonly paymentGroupOf: (organizationId: DeleteInvoiceCommand["organizationId"], invoiceId: string) => Promise<string | null>,
  ) {}

  async execute(command: DeleteInvoiceCommand): Promise<void> {
    const paymentGroupId = await this.paymentGroupOf(command.organizationId, command.id).catch(() => null);
    await this.inner.execute(command);
    try {
      await this.links.releaseInvoice(command.organizationId, command.id, paymentGroupId);
    } catch (e) {
      console.error("[invoices] falha ao desfazer a associação à recorrência (ignorada):", e);
    }
  }
}
