import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { PosRuleError } from "../../domain/errors.js";
import type { InvoiceLine, InvoicingGatewayPort, IssuedDocument } from "../../domain/ports/out/pos.ports.js";

/** Pedido de emissão no formato da porta de entrada do módulo `invoicing`. */
export interface IssueRequest {
  seriesRef: string;
  customer: { taxId: string; name: string } | null;
  pricesIncludeTax: true;
  lines: Array<{
    productCode: string;
    productType: "P" | "S";
    unit: string;
    description: string;
    quantity: string;
    unitPrice: string;
    discountPct?: string;
    tax: { region: "PT"; rate: "RED" | "INT" | "NOR" };
  }>;
  paymentMechanism?: "CD" | "NU" | "OU";
  references?: Array<{ documentId: string; reason: string }>;
  actor: string;
}

/** Funções do módulo `invoicing` passadas pelo server.ts (sem importar o módulo). */
export interface InvoicingFunctions {
  issue(org: OrganizationId, req: IssueRequest): Promise<{ documentId: string; documentNumber: string }>;
  /** Total com IVA («12.50») e cliente do documento gravado. */
  document(org: OrganizationId, id: string): Promise<{ grossTotal: string; customer: { taxId: string; name: string } }>;
}

const RATE = { 6: "RED", 13: "INT", 23: "NOR" } as const;
const FINAL_CONSUMER_TAX_ID = "999999990";

const cents = (euros: string) => {
  const [i, f = ""] = euros.split(".");
  return Number(i) * 100 + Number((f + "00").slice(0, 2));
};

function toRequestLine(l: InvoiceLine): IssueRequest["lines"][number] {
  const rate = RATE[l.vatRate as keyof typeof RATE];
  if (!rate) throw new PosRuleError(`${l.description}: IVA ${l.vatRate} % não suportado`);
  return {
    productCode: l.productCode,
    productType: l.productType,
    unit: "UN",
    description: l.description,
    quantity: String(l.quantity),
    unitPrice: l.unitPrice,
    ...(l.discountPct ? { discountPct: l.discountPct } : {}),
    tax: { region: "PT", rate },
  };
}

/** Erros do motor de faturação → regra do POS, com a mensagem fiscal. */
async function fiscal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (["InvoicingRuleError", "InvoicingNotFoundError", "InvoicingUnavailableError", "IssueNeedsConfirmationError", "StaleSeriesError"].includes(name)) {
      throw new PosRuleError(`Faturação: ${(e as Error).message}`);
    }
    throw e;
  }
}

export class InvoicingGateway implements InvoicingGatewayPort {
  constructor(private readonly fns: InvoicingFunctions) {}

  private async issued(org: OrganizationId, out: { documentId: string; documentNumber: string }): Promise<IssuedDocument> {
    const doc = await this.fns.document(org, out.documentId);
    return { ...out, totalCents: cents(doc.grossTotal) };
  }

  async issueInvoiceReceipt(org: OrganizationId, q: Parameters<InvoicingGatewayPort["issueInvoiceReceipt"]>[1]) {
    const out = await fiscal(() =>
      this.fns.issue(org, { seriesRef: q.seriesRef, customer: q.customer, pricesIncludeTax: true, lines: q.lines.map(toRequestLine), paymentMechanism: q.paymentMechanism, actor: q.actor }),
    );
    return this.issued(org, out);
  }

  async issueCreditNote(org: OrganizationId, q: Parameters<InvoicingGatewayPort["issueCreditNote"]>[1]) {
    const out = await fiscal(() =>
      this.fns.issue(org, {
        seriesRef: q.seriesRef,
        customer: q.customer,
        pricesIncludeTax: true,
        lines: q.lines.map(toRequestLine),
        references: [{ documentId: q.referenceDocumentId, reason: q.reason }],
        actor: q.actor,
      }),
    );
    return this.issued(org, out);
  }

  async documentCustomer(org: OrganizationId, documentId: string) {
    const doc = await fiscal(() => this.fns.document(org, documentId));
    return doc.customer.taxId === FINAL_CONSUMER_TAX_ID ? null : { taxId: doc.customer.taxId, name: doc.customer.name };
  }
}
