import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { FiscalIdentityPort, InvoiceFiscalCheck, InvoiceFiscalInput } from "../../domain/ports/out/fiscal-identity.port.js";

/** Identidade fiscal falsa: por omissão aceita tudo; `next` força a próxima resposta de claim. */
export class FakeFiscalIdentityPort implements FiscalIdentityPort {
  claims: { input: InvoiceFiscalInput; invoiceId: string; opts: unknown }[] = [];
  released: string[] = [];
  next: InvoiceFiscalCheck | null = null;
  nextCheck: InvoiceFiscalCheck | null = null;
  async check(): Promise<InvoiceFiscalCheck> {
    const r = this.nextCheck ?? { kind: "new" };
    this.nextCheck = null;
    return r;
  }
  async claim(_o: OrganizationId, _a: string, input: InvoiceFiscalInput, invoiceId: string, opts?: unknown): Promise<InvoiceFiscalCheck> {
    this.claims.push({ input, invoiceId, opts });
    const r = this.next ?? { kind: "ok", identityId: `fid-${invoiceId}`, linkedToStock: false };
    this.next = null;
    return r;
  }
  async release(_o: OrganizationId, _a: string, invoiceId: string) {
    this.released.push(invoiceId);
  }
}
