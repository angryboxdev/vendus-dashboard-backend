/**
 * Documentos fictícios com a estrutura dos reais: fatura semanal da Bolt (texto do pdf-parse),
 * relatório de pedidos da Bolt (CSV) e SAF-T de vendas do AirMenu. Valores inventados mas coerentes.
 */

export const BOLT_INVOICE_TEXT = `Total (EUR) \t40.00
IVA (0%) \t0
Total IVA (EUR) \t0
Total incluíndo IVA (EUR): \t40.00
Autoliquidação de IVA
Fatura
Fatura nº: PT9999-000123
Data: 08-03-2026
Prazo: 07-04-2026
Restaurante
Restaurante Teste
Destinatário
Empresa Teste, Lda 	Bolt Operations OÜ
Período da fatura: 23-02-2026 - 01-03-2026
Título 	Total (EUR) 	IVA (%) 	IVA (EUR) Total (EUR)
Comissão semanal 	30.00 	0 	0 	30.00
Custos com campanhas
cofinanciadas 1.00 	0 	0 	1.00
Investimento na campanha 	-10.00 	0 	0 	-10.00
Taxa da campanha 	5.00 	0 	0 	5.00
Deduções dos reembolsos 	14.00 	0 	0 	14.00

-- 1 of 1 --`;

const BOLT_HEADER =
  "Provider Name,Provider External ID,Provider Address,Order Local Time Zone,Order Reference ID,Finished Order Status,Delivery Type,Payment Method Type,Order Create Date,Order Create Datetime,Order Accepted Datetime,Prep Time Estimate Datetime,Order Marked Ready for Pickup,Courier Arrive Datetime,Courier Pickup Datetime,Order Delivered Datetime,Preparation Estimate error (minutes),Actor At Fault if Failed,Provider Reject Reason,Provider Commission,Delivery Fee,Small Order Fee,Order Total Gross,Order Total VAT,Order Total Net,Order items no,Rating,Rating Comment,Waiter tip";
const boltRow = (ref: string, status: string, payment: string, date: string, gross: string, comment = "") =>
  `Restaurante Teste,,"Rua Fictícia 1, Porto",Europe/Lisbon,${ref},${status},platform,${payment},${date},${date} 20:00:00,,,,,,,0,,,33,,,${gross},,${gross},2,,"${comment}",`;

export const BOLT_ORDERS_CSV = [
  BOLT_HEADER,
  boltRow("AAAA1", "delivered", "cashless", "2026-02-27", "20.50", "Muito bom, obrigado"),
  boltRow("AAAA2", "delivered", "cash", "2026-02-27", "10"),
  boltRow("AAAA3", "failed", "cashless", "2026-02-28", "15.00"),
  boltRow("AAAA4", "delivered", "cashless", "2026-03-02", "30.25"),
].join("\r\n");

const invoice = (no: string, status: string, type: string, date: string, net: string, vat: string, gross: string) => `
      <Invoice>
        <InvoiceNo>${no}</InvoiceNo>
        <DocumentStatus><InvoiceStatus>${status}</InvoiceStatus></DocumentStatus>
        <InvoiceDate>${date}</InvoiceDate>
        <InvoiceType>${type}</InvoiceType>
        <CustomerID>999</CustomerID>
        <Line><ProductDescription>Pizza Teste</ProductDescription><CreditAmount>${net}</CreditAmount></Line>
        <DocumentTotals><TaxPayable>${vat}</TaxPayable><NetTotal>${net}</NetTotal><GrossTotal>${gross}</GrossTotal></DocumentTotals>
      </Invoice>`;

export const saftText = (productId = "NET-BO/Teste", totalCredit = "26.55") => `<?xml version="1.0" encoding="Windows-1252"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:PT_1.04_01">
  <Header>
    <AuditFileVersion>1.04_01</AuditFileVersion>
    <StartDate>2026-03-01</StartDate>
    <EndDate>2026-03-31</EndDate>
    <ProductID>${productId}</ProductID>
  </Header>
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>4</NumberOfEntries>
      <TotalDebit>5.00</TotalDebit>
      <TotalCredit>${totalCredit}</TotalCredit>${invoice("FR A2026/1", "N", "FR", "2026-03-01", "10.00", "1.30", "11.30")}${invoice("FR A2026/2", "N", "FR", "2026-03-01", "16.55", "2.15", "18.70")}${invoice("FR A2026/3", "A", "FR", "2026-03-02", "99.00", "12.87", "111.87")}${invoice("NC A2026/1", "N", "NC", "2026-03-02", "5.00", "0.65", "5.65")}
    </SalesInvoices>
  </SourceDocuments>
</AuditFile>`;
