import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { IntakeDestination } from "../../domain/entities/inbound-attachment.js";
import type { InvoiceIntakePort, InvoiceIntakeResult } from "../../domain/ports/out/email-intake.out-ports.js";
import type { ImportInvoiceFromEmailPort } from "../../../invoices/domain/ports/in/email-import.ports.js";

/** Delega na porta de entrada do módulo invoices (o mesmo import do ecrã; ligado em server.ts). */
export class InvoicesIntakeAdapter implements InvoiceIntakePort {
  constructor(private readonly importFromEmail: ImportInvoiceFromEmailPort) {}

  import(organizationId: OrganizationId, file: { bytes: Buffer; filename: string }, destination: IntakeDestination): Promise<InvoiceIntakeResult> {
    return this.importFromEmail.execute({ organizationId, destination, fileBuffer: file.bytes, filename: file.filename });
  }
}
