import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import type { AllocationBasis, MarginReport, PlatformMargin } from "../../domain/entities/margin-report.js";
import type { MarginReportWriterPort } from "../../domain/ports/out/margin-report-writer.port.js";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const NAMES: Record<PlatformMargin["platform"], string> = { uber_eats: "Uber Eats", glovo: "Glovo", bolt_food: "Bolt Food", total: "Total" };
const BASIS: Record<AllocationBasis, string> = {
  month: "inteiro no mês",
  daily: "só os dias do mês",
  orders: "pelas vendas diárias da Bolt",
  saft: "pelo faturado diário do SAF-T",
  days: "pela proporção de dias (estimativa)",
};

type Kind = "eur" | "pct" | "int";
interface Row {
  label: string;
  value: (m: PlatformMargin) => number | null;
  kind?: Kind;
  strong?: boolean;
}

/** Linhas do relatório, da venda com IVA à margem líquida (as mesmas no Excel e no PDF). */
const rows = (r: MarginReport): Row[] => [
  { label: "Pedidos", value: (m) => m.ordersCount, kind: "int" },
  { label: "Vendas, preço de tabela (com IVA)", value: (m) => m.salesGrossCents },
  { label: "(-) IVA dentro do preço (do Estado)", value: (m) => -(m.salesGrossCents - m.salesNetCents) },
  { label: "= Vendas sem IVA (base das %)", value: (m) => m.salesNetCents, strong: true },
  { label: "(-) Promoções (sem IVA)", value: (m) => -m.promotionsNetCents },
  { label: "= Faturado aos clientes (sem IVA)", value: (m) => m.invoicedNetCents, strong: true },
  { label: "(-) Comissões", value: (m) => -m.commissionNetCents },
  { label: "(-) Marketing e campanhas", value: (m) => -m.marketingNetCents },
  { label: "(-) Reembolsos e outras taxas", value: (m) => -m.otherNetCents },
  { label: "= MARGEM BRUTA", value: (m) => m.grossMarginCents, strong: true },
  { label: "   % das vendas", value: (m) => m.grossMarginPct, kind: "pct" },
  { label: `(-) Comida e embalagem (${r.foodCostSource === "real" ? "real" : "estim."} ${r.foodCostPct.toLocaleString("pt-PT")}%)`, value: (m) => -m.foodCostCents },
  { label: r.foodCostSource === "real" ? "= MARGEM LÍQUIDA" : "= MARGEM LÍQUIDA (estim.)", value: (m) => m.netMarginCents, strong: true },
  { label: "   % das vendas", value: (m) => m.netMarginPct, kind: "pct" },
  { label: "   por pedido", value: (m) => m.netMarginPerOrderCents },
  { label: "IVA das vendas (a entregar)", value: (m) => m.salesVatCents },
  { label: "(-) IVA das taxas da plataforma (a deduzir)", value: (m) => -m.feesVatCents },
  { label: "= IVA a entregar ao Estado", value: (m) => m.vatToPayCents, strong: true },
  { label: "Líquido dos extratos (transferido)", value: (m) => m.netPayoutCents },
];

const columns = (r: MarginReport) => [...r.platforms, r.total];
const title = (r: MarginReport) => `Margem do delivery — ${MONTHS[r.period.month - 1]} ${r.period.year}`;
const eur = (cents: number) =>
  `${cents < 0 ? "-" : ""}${(Math.abs(cents) / 100).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const format = (v: number | null, kind: Kind = "eur") =>
  v === null ? "—" : kind === "pct" ? `${v.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : kind === "int" ? String(v) : eur(v);
const vatLabel = (r: MarginReport) =>
  `IVA das vendas ${(r.salesVatRate * 100).toLocaleString("pt-PT", { maximumFractionDigits: 2 })}% (${r.salesVatRateSource === "saft" ? "pelo SAF-T do mês" : "estimado"})`;

/** Relatório de margem por plataforma em Excel (folhas «Margem» e «Documentos») e em PDF (pdfkit). */
export class MarginReportWriterAdapter implements MarginReportWriterPort {
  xlsx(r: MarginReport): Uint8Array {
    const cols = columns(r);
    const value = (row: Row, m: PlatformMargin) => {
      const v = row.value(m);
      return v === null ? "" : row.kind === "pct" || row.kind === "int" ? v : v / 100;
    };
    const margin = XLSX.utils.aoa_to_sheet([
      [title(r)],
      [`Valores em euros. As % são sobre as vendas sem IVA. ${vatLabel(r)}.`],
      [],
      ["", ...cols.map((m) => NAMES[m.platform])],
      ...rows(r).map((row) => [row.label.trim(), ...cols.map((m) => value(row, m))]),
      [],
      ...(r.saft
        ? [
            ["Conferência com o SAF-T (com IVA)"],
            ["Faturado no SAF-T", r.saft.invoicedCents / 100],
            ["Clientes pagaram (extratos)", r.saft.platformsPaidCents / 100],
            ["Diferença", r.saft.differenceCents / 100],
            [],
          ]
        : []),
      ["Avisos"],
      ...r.warnings.map((w) => [w]),
    ]);
    margin["!cols"] = [{ wch: 44 }, ...cols.map(() => ({ wch: 14 }))];
    const documents = XLSX.utils.aoa_to_sheet([
      ["Plataforma", "Documento", "Número", "De", "Até", "Parte do mês", "Como"],
      ...r.documents.map((d) => [
        d.platform === "airmenu" ? "SAF-T AirMenu" : NAMES[d.platform],
        d.documentKind,
        d.documentNumber,
        d.periodFrom,
        d.periodTo,
        Math.round(d.share * 1000) / 1000,
        BASIS[d.basis],
      ]),
    ]);
    documents["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 34 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, margin, "Margem");
    XLSX.utils.book_append_sheet(book, documents, "Documentos");
    return new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
  }

  pdf(r: MarginReport): Promise<Uint8Array> {
    const NAVY = "#1B2A4A";
    const GREY = "#5B6475";
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: title(r) } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Uint8Array>((resolve) => doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))));
    const L = 40;
    const W = doc.page.width - 80;
    const text = (t: string, o: { size?: number; bold?: boolean; color?: string } = {}) =>
      doc.fillColor(o.color ?? "#222").font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 9.5).text(t, L, undefined, { width: W, lineGap: 1.5 });
    const heading = (t: string) => {
      if (doc.y > doc.page.height - 150) doc.addPage();
      doc.moveDown(0.8);
      text(t, { size: 12.5, bold: true, color: NAVY });
      doc.moveDown(0.3);
    };
    const table = (head: string[], body: { cells: string[]; strong?: boolean | undefined }[], widths: number[]) => {
      let y = doc.y;
      const draw = (cells: string[], o: { fill?: string | undefined; color?: string; strong?: boolean | undefined }) => {
        if (y + 16 > doc.page.height - 45) {
          doc.addPage();
          y = doc.y;
        }
        if (o.fill) doc.rect(L, y - 4, widths.reduce((a, b) => a + b, 0), 16).fill(o.fill);
        let x = L;
        cells.forEach((c, i) => {
          doc.fillColor(o.color ?? "#222").font(o.strong ? "Helvetica-Bold" : "Helvetica").fontSize(8.6)
            .text(c, x + 4, y, { width: widths[i]! - 8, align: i === 0 ? "left" : "right", lineBreak: false });
          x += widths[i]!;
        });
        y += 16;
      };
      draw(head, { fill: NAVY, color: "#fff", strong: true });
      body.forEach((b, i) => draw(b.cells, { fill: b.strong ? "#E7EEF8" : i % 2 ? "#F2F3F6" : undefined, strong: b.strong }));
      doc.y = y + 6;
      doc.x = L;
    };

    text(title(r), { size: 18, bold: true, color: NAVY });
    text("Uber Eats, Glovo e Bolt Food, a partir dos extratos importados.", { color: GREY });
    doc.moveDown(0.5);
    text(
      "Margem bruta: o que sobra depois de a plataforma ficar com a sua parte (promoções, comissões, marketing, reembolsos). " +
        "Margem líquida: depois também da comida e da embalagem. Fora ficam pessoal, renda e energia. " +
        `Começa nas vendas com IVA (como nos extratos); a 2.ª linha tira o IVA, que é do Estado. ${vatLabel(r)}.`,
    );

    heading("A conta, linha a linha");
    const cols = columns(r);
    const first = Math.max(150, W - cols.length * 82);
    table(
      ["", ...cols.map((m) => NAMES[m.platform])],
      rows(r).map((row) => ({ cells: [row.label, ...cols.map((m) => format(row.value(m), row.kind))], strong: row.strong })),
      [first, ...cols.map(() => (W - first) / cols.length)],
    );

    if (r.saft) {
      heading("Conferência com o SAF-T do AirMenu");
      table(
        ["Com IVA", "Valor"],
        [
          { cells: ["Faturado no SAF-T (menos notas de crédito)", eur(r.saft.invoicedCents)] },
          { cells: ["Os clientes pagaram, segundo os extratos (vendas - promoções)", eur(r.saft.platformsPaidCents)] },
          { cells: ["Diferença", eur(r.saft.differenceCents)], strong: true },
        ],
        [W - 120, 120],
      );
    }

    heading("Documentos usados");
    table(
      ["Documento", "Período", "Parte do mês", "Como"],
      r.documents.map((d) => ({
        cells: [
          `${d.platform === "airmenu" ? "SAF-T AirMenu" : NAMES[d.platform]} ${d.documentNumber}`,
          `${d.periodFrom.slice(8, 10)}/${d.periodFrom.slice(5, 7)} - ${d.periodTo.slice(8, 10)}/${d.periodTo.slice(5, 7)}`,
          `${Math.round(d.share * 100)}%`,
          BASIS[d.basis],
        ],
      })),
      [W * 0.38, W * 0.17, W * 0.13, W * 0.32],
    );

    heading("Avisos e pressupostos");
    for (const w of r.warnings) text(`•  ${w}`, { size: 9 });
    text("•  Documento de gestão, não contabilístico — validar com o contabilista antes de uso oficial.", { size: 9 });
    doc.end();
    return done;
  }
}
