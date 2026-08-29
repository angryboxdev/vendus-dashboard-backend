import type { AddInvoiceLinePort, AddInvoiceLineCommand, InvoiceLineDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError, LineDetailModeError, LinesTotalMismatchError } from "../../domain/errors.js";
import { toInvoiceLineDTO } from "./shared.js";

/** Tolerância máxima de arredondamento: 1 cêntimo (valores em cêntimos inteiros) */
const LINE_TOTAL_TOLERANCE_CENTS = 1;

export class AddInvoiceLineUseCase implements AddInvoiceLinePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
  ) {}

  async execute(command: AddInvoiceLineCommand): Promise<InvoiceLineDTO> {
    const invoice = await this.invoiceRepo.findById(command.organizationId, command.invoiceId);
    if (!invoice) throw new InvoiceNotFoundError(command.invoiceId);

    if (invoice.lineDetailMode === "simple") {
      throw new LineDetailModeError(command.invoiceId);
    }

    // Validar que a nova linha não fará a soma divergir dos totais da fatura
    const existingLines = await this.lineRepo.findByInvoiceId(command.organizationId, command.invoiceId);
    const newTotalWithVat = existingLines.reduce((sum, l) => sum + l.totalWithVat, 0) + command.totalWithVat;

    // Bloquear apenas quando a soma das linhas EXCEDE o total da fatura (além da tolerância).
    // Somas parciais (ainda abaixo do total) são permitidas — o utilizador pode estar a
    // adicionar as linhas de forma incremental. Só verificamos totalWithVat: vatAmount e
    // subtotalWithoutVat são campos derivados que podem ter arredondamentos diferentes dos
    // valores linha-a-linha, causando falsos positivos em faturas importadas por IA.
    if (newTotalWithVat > invoice.totalWithVat + LINE_TOTAL_TOLERANCE_CENTS) {
      throw new LinesTotalMismatchError(command.invoiceId);
    }

    const createProps: Parameters<typeof InvoiceLine.create>[0] = {
      invoiceId: command.invoiceId,
      description: command.description,
      quantity: command.quantity,
      unitCostWithoutVat: command.unitCostWithoutVat,
      vatRate: command.vatRate,
      vatAmount: command.vatAmount,
      totalWithVat: command.totalWithVat,
    };
    if (command.type !== undefined) createProps.type = command.type;
    if (command.costCenterCategoryId !== undefined) createProps.costCenterCategoryId = command.costCenterCategoryId;
    if (command.unit !== undefined) createProps.unit = command.unit;
    if (command.locationId !== undefined) createProps.locationId = command.locationId;
    const line = InvoiceLine.create(createProps);

    await this.lineRepo.saveAll(command.organizationId, [line]);
    return toInvoiceLineDTO(line);
  }
}
