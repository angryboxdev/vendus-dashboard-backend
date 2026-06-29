import type {
  UpdateInvoicePort,
  UpdateInvoiceCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import type { UpdateInvoiceData } from "../../domain/entities/invoice.js";
import { toInvoiceDTO } from "./shared.js";

export class UpdateInvoiceUseCase implements UpdateInvoicePort {
  constructor(private readonly invoiceRepo: InvoiceRepositoryPort) {}

  async execute(command: UpdateInvoiceCommand): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);

    const data: UpdateInvoiceData = {};
    if (command.supplierId !== undefined) data.supplierId = command.supplierId;
    if (command.supplierName !== undefined) data.supplierName = command.supplierName;
    if (command.supplierNifSnapshot !== undefined) data.supplierNifSnapshot = command.supplierNifSnapshot;
    if (command.invoiceNumber !== undefined) data.invoiceNumber = command.invoiceNumber;
    if (command.invoiceDate !== undefined) data.invoiceDate = new Date(command.invoiceDate);
    if (command.dueDate !== undefined) data.dueDate = command.dueDate ? new Date(command.dueDate) : null;
    if (command.subtotalWithoutVat !== undefined) data.subtotalWithoutVat = command.subtotalWithoutVat;
    if (command.totalVat !== undefined) data.totalVat = command.totalVat;
    if (command.totalWithVat !== undefined) data.totalWithVat = command.totalWithVat;
    if (command.notes !== undefined) data.notes = command.notes;
    if (command.attachmentUrl !== undefined) data.attachmentUrl = command.attachmentUrl;
    if (command.costCenterGroupId !== undefined) data.costCenterGroupId = command.costCenterGroupId;
    if (command.financialType !== undefined) data.financialType = command.financialType;
    if (command.affectsDre !== undefined) data.affectsDre = command.affectsDre;
    if (command.affectsCashflow !== undefined) data.affectsCashflow = command.affectsCashflow;
    if (command.affectsProfitability !== undefined) data.affectsProfitability = command.affectsProfitability;
    if (command.currency !== undefined) data.currency = command.currency;

    const updated = existing.update(data);
    await this.invoiceRepo.update(updated);
    return toInvoiceDTO(updated);
  }
}
