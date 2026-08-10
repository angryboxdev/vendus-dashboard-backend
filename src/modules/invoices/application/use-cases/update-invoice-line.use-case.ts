import type { UpdateInvoiceLinePort, UpdateInvoiceLineCommand, InvoiceLineDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError, LineDetailModeError, LinesTotalMismatchError } from "../../domain/errors.js";
import { toInvoiceLineDTO } from "./shared.js";

const LINE_TOTAL_TOLERANCE_CENTS = 1;

export class UpdateInvoiceLineUseCase implements UpdateInvoiceLinePort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly lineRepo: InvoiceLineRepositoryPort,
  ) {}

  async execute(command: UpdateInvoiceLineCommand): Promise<InvoiceLineDTO> {
    const invoice = await this.invoiceRepo.findById(command.invoiceId);
    if (!invoice) throw new InvoiceNotFoundError(command.invoiceId);

    if (invoice.lineDetailMode === "simple") {
      throw new LineDetailModeError(command.invoiceId);
    }

    const existingLines = await this.lineRepo.findByInvoiceId(command.invoiceId);
    const line = existingLines.find((l) => l.id === command.lineId);
    if (!line) throw new InvoiceLineNotFoundError(command.lineId);

    const updatedLine = line.updateValues({
      description: command.description,
      quantity: command.quantity,
      unit: command.unit,
      unitCostWithoutVat: command.unitCostWithoutVat,
      vatRate: command.vatRate,
      vatAmount: command.vatAmount,
      totalWithVat: command.totalWithVat,
    });

    // Validate: sum of all lines (with updated line) must not exceed invoice totals
    const otherLines = existingLines.filter((l) => l.id !== command.lineId);
    const newTotal = otherLines.reduce((s, l) => s + l.totalWithVat, 0) + updatedLine.totalWithVat;
    const newVat = otherLines.reduce((s, l) => s + l.vatAmount, 0) + updatedLine.vatAmount;
    const newSubtotal = newTotal - newVat;

    if (
      newTotal > invoice.totalWithVat + LINE_TOTAL_TOLERANCE_CENTS ||
      newVat > invoice.totalVat + LINE_TOTAL_TOLERANCE_CENTS ||
      newSubtotal > invoice.subtotalWithoutVat + LINE_TOTAL_TOLERANCE_CENTS
    ) {
      throw new LinesTotalMismatchError(command.invoiceId);
    }

    await this.lineRepo.updateLine(updatedLine);
    return toInvoiceLineDTO(updatedLine);
  }
}
