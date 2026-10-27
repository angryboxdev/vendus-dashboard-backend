import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceExistencePort } from "../../domain/ports/out/email-intake.out-ports.js";

/** Leitura cross-módulo da tabela `invoices` (só ids, da própria empresa) — sem importar o módulo invoices. */
export class SupabaseInvoiceExistenceAdapter implements InvoiceExistencePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async existing(organizationId: OrganizationId, invoiceIds: string[]): Promise<Set<string>> {
    const { data, error } = await this.scopedQuery(organizationId).table("invoices").select("id").in("id", invoiceIds);
    if (error) throw new Error(error.message);
    return new Set(((data ?? []) as unknown as { id: string }[]).map((r) => r.id));
  }
}
