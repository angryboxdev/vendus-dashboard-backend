import type { AddInvoiceLinePort, AddInvoiceLineCommand, InvoiceLineDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { toInvoiceLineDTO } from "./shared.js";

export class AddInvoiceLineUseCase implements AddInvoiceLinePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
  ) {}

  async execute(command: AddInvoiceLineCommand): Promise<InvoiceLineDTO> {
    const invoice = await this.invoiceRepo.findById(command.invoiceId);
    if (!invoice) throw new InvoiceNotFoundError(command.invoiceId);

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
    const line = InvoiceLine.create(createProps);

    await this.lineRepo.saveAll([line]);
    return toInvoiceLineDTO(line);
  }
}
