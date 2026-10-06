import type { SalesDeclarationFileWriterPort } from "../../domain/ports/out/sales-declaration-file-writer.port.js";
import type { SalesDeclarationRow, SalesDeclarationStore } from "../../domain/entities/sales-declaration.js";

export class FakeFileWriter implements SalesDeclarationFileWriterPort {
  received: { store: SalesDeclarationStore; rows: SalesDeclarationRow[] } | null = null;
  write(store: SalesDeclarationStore, rows: SalesDeclarationRow[]): Buffer {
    this.received = { store, rows };
    return Buffer.from("fake");
  }
}

export const STORE: SalesDeclarationStore = {
  businessUnitCode: "PT32",
  businessUnit: "Mercado Bom Sucesso",
  companyName: "ANGRY BOX PIZZA SHOP",
  storeNumber: "L027",
  contract: "0000100000040",
};

export interface FixtureInvoice {
  no: string;
  date: string;
  type?: string;
  status?: string;
  net: string;
}

/** SAF-T mínimo (mesma estrutura do Vendus e do back-office AirMenu). */
export function saft(
  invoices: FixtureInvoice[],
  period: { start?: string; end?: string } = {},
): string {
  const header =
    `<Header><CompanyName>Teste</CompanyName>` +
    (period.start ? `<StartDate>${period.start}</StartDate>` : "") +
    (period.end ? `<EndDate>${period.end}</EndDate>` : "") +
    `</Header>`;
  const docs = invoices
    .map(
      (i) =>
        `<Invoice><InvoiceNo>${i.no}</InvoiceNo><DocumentStatus><InvoiceStatus>${i.status ?? "N"}</InvoiceStatus></DocumentStatus>` +
        `<InvoiceDate>${i.date}</InvoiceDate><InvoiceType>${i.type ?? "FS"}</InvoiceType>` +
        `<Line><CreditAmount>999</CreditAmount></Line>` +
        `<DocumentTotals><TaxPayable>1.00</TaxPayable><NetTotal>${i.net}</NetTotal><GrossTotal>999.00</GrossTotal></DocumentTotals></Invoice>`,
    )
    .join("");
  return `<?xml version="1.0"?><AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:PT_1.04_01">${header}<SourceDocuments><SalesInvoices><NumberOfEntries>${invoices.length}</NumberOfEntries>${docs}</SalesInvoices></SourceDocuments></AuditFile>`;
}
