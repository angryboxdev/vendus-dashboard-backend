import { InvalidSaftFileError } from "../errors.js";
import type { IsoDate, SaftSalesData, SaftSalesDocument } from "../entities/sales-declaration.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function tag(block: string, name: string): string | null {
  return block.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`))?.[1] ?? null;
}

function isoDateOrNull(value: string | null): IsoDate | null {
  return value && ISO_DATE.test(value) ? value : null;
}

/**
 * Lê as vendas de um SAF-T (PT 1.04_01): para cada `<Invoice>` de `SalesInvoices`,
 * o `NetTotal` (sem IVA) na `InvoiceDate`. Notas de crédito (`NC`) ficam negativas.
 * Documentos anulados (`InvoiceStatus` = A) não contam.
 *
 * Funciona com o SAF-T do Vendus e com o do back-office do AirMenu (mesmo formato).
 * Recebe o texto do ficheiro — a leitura/decodificação dos bytes é do adaptador de entrada.
 */
export function parseSaftSales(xml: string): SaftSalesData {
  if (!/<AuditFile[\s>]/.test(xml)) {
    throw new InvalidSaftFileError("O ficheiro não é um SAF-T (falta o elemento AuditFile)");
  }
  const salesInvoices = xml.match(/<SalesInvoices>[\s\S]*?<\/SalesInvoices>/)?.[0];
  if (salesInvoices === undefined) {
    throw new InvalidSaftFileError("O SAF-T não tem vendas (falta o elemento SalesInvoices)");
  }

  const header = xml.match(/<Header>[\s\S]*?<\/Header>/)?.[0] ?? "";
  const documents: SaftSalesDocument[] = [];

  for (const [invoice] of salesInvoices.matchAll(/<Invoice>[\s\S]*?<\/Invoice>/g)) {
    if (tag(invoice, "InvoiceStatus") === "A") continue;

    const number = tag(invoice, "InvoiceNo");
    const date = isoDateOrNull(tag(invoice, "InvoiceDate"));
    const net = Number(tag(invoice, "NetTotal"));
    if (number === null || date === null || !Number.isFinite(net)) {
      throw new InvalidSaftFileError(`Documento inválido no SAF-T (${number ?? "sem número"})`);
    }

    const cents = Math.round(net * 100);
    documents.push({ number, date, netCents: tag(invoice, "InvoiceType") === "NC" ? -cents : cents });
  }

  return {
    startDate: isoDateOrNull(tag(header, "StartDate")),
    endDate: isoDateOrNull(tag(header, "EndDate")),
    documents,
  };
}
