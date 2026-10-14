import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Invoice } from "../../domain/entities/invoice.js";
import { FiscalIdentityConflictError } from "../../domain/errors.js";
import type { FiscalIdentityPort, InvoiceFiscalInput } from "../../domain/ports/out/fiscal-identity.port.js";
import type { SupplierLookupPort } from "../../domain/ports/out/supplier-lookup.port.js";

const MISSING_LABEL: Record<string, string> = { series_number: "número da fatura", issuer_country: "país do NIF do fornecedor", issuer_tax_id: "NIF do fornecedor" };

/** NIF do emitente: o da fatura, ou o do fornecedor ligado (nunca inventado). */
export async function fiscalInputOf(org: OrganizationId, invoice: Invoice, suppliers: SupplierLookupPort): Promise<InvoiceFiscalInput> {
  const own = invoice.supplierNifSnapshot?.trim();
  const supplierNif = own || (invoice.supplierId ? ((await suppliers.findById(org, invoice.supplierId))?.nif ?? null) : null);
  return { legalEntityId: null, supplierNif, documentType: invoice.documentType, invoiceNumber: invoice.invoiceNumber?.trim() || null, atcud: null };
}

/**
 * Reserva a identidade fiscal antes de finalizar (confirmar/criar/corrigir).
 * Falha → FiscalIdentityConflictError (o ecrã oferece abrir o original,
 * completar o do Stock, comparar ou completar os dados) e NADA é finalizado.
 */
export async function claimFiscalIdentity(
  fiscal: FiscalIdentityPort,
  suppliers: SupplierLookupPort,
  org: OrganizationId,
  actor: string,
  invoice: Invoice,
  opts: { notADuplicate?: boolean; completeStockIdentityId?: string } = {},
): Promise<{ linkedToStock: boolean }> {
  const r = await fiscal.claim(org, actor, await fiscalInputOf(org, invoice, suppliers), invoice.id, opts);
  switch (r.kind) {
    case "ok":
      return { linkedToStock: r.linkedToStock };
    case "new":
      return { linkedToStock: false };
    case "incomplete":
      throw new FiscalIdentityConflictError(
        "identity_incomplete",
        `Identidade fiscal incompleta (${r.missing.map((m) => MISSING_LABEL[m] ?? m).join(", ")}). Complete os dados antes de finalizar; pode guardar como rascunho.`,
        { missing: r.missing },
      );
    case "existing_finance":
      throw new FiscalIdentityConflictError("existing_finance", "Este documento já está registado no Financeiro. Abra o documento existente em vez de criar uma cópia.", { existingInvoiceId: r.existingInvoiceId, identityId: r.identityId });
    case "existing_stock_only":
      throw new FiscalIdentityConflictError("existing_stock_only", "Este documento já foi importado no Stock. Pode completar o lançamento existente (sem duplicar o documento nem as quantidades).", { identityId: r.identityId });
    case "possible_duplicate":
      throw new FiscalIdentityConflictError("possible_duplicate", "Há um documento parecido (mesmo fornecedor, número com formatação diferente). Compare antes de continuar.", { candidates: r.candidates });
  }
}
