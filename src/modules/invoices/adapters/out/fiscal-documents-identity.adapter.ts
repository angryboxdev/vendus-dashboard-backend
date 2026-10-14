import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { FiscalDocumentsPort } from "../../../fiscal-documents/domain/ports/in/fiscal-documents.ports.js";
import type { FiscalIdentity, IdentityResolution } from "../../../fiscal-documents/domain/entities/fiscal-identity.js";
import type { FiscalIdentityPort, InvoiceFiscalCheck, InvoiceFiscalInput } from "../../domain/ports/out/fiscal-identity.port.js";

const toInput = (i: InvoiceFiscalInput) => ({ buyerLegalEntityId: i.legalEntityId, issuerTaxId: i.supplierNif, issuerCountry: null, documentType: i.documentType, seriesNumber: i.invoiceNumber, atcud: i.atcud });
const candidate = (c: FiscalIdentity) => ({ invoiceId: c.invoiceId, seriesNumber: c.seriesNumber });

function fromResolution(r: IdentityResolution): InvoiceFiscalCheck {
  switch (r.kind) {
    case "new":
      return { kind: "new" };
    case "incomplete":
      return { kind: "incomplete", missing: r.missing };
    case "existing_finance":
      return { kind: "existing_finance", identityId: r.identity.id, existingInvoiceId: r.identity.invoiceId };
    case "existing_stock_only":
      return { kind: "existing_stock_only", identityId: r.identity.id };
    case "possible_duplicate":
      return { kind: "possible_duplicate", candidates: r.candidates.map(candidate) };
  }
}

/** Liga as faturas à identidade fiscal partilhada (módulo fiscal-documents). */
export class FiscalDocumentsIdentityAdapter implements FiscalIdentityPort {
  constructor(private readonly fiscal: FiscalDocumentsPort) {}

  async check(org: OrganizationId, input: InvoiceFiscalInput) {
    return fromResolution(await this.fiscal.resolve(org, toInput(input)));
  }

  async claim(org: OrganizationId, actor: string, input: InvoiceFiscalInput, invoiceId: string, opts: { notADuplicate?: boolean; completeStockIdentityId?: string } = {}): Promise<InvoiceFiscalCheck> {
    const r = await this.fiscal.claimForInvoice(org, actor, toInput(input), invoiceId, opts);
    return r.ok ? { kind: "ok", identityId: r.identity.id, linkedToStock: r.linkedToStock } : fromResolution(r.resolution);
  }

  release(org: OrganizationId, actor: string, invoiceId: string) {
    return this.fiscal.releaseInvoice(org, actor, invoiceId);
  }
}
