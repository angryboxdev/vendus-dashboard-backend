import * as XLSX from "xlsx";
import { safeCell, type ExportTable } from "../../domain/entities/attendance-days.js";
import type { TableWriterPort } from "../../domain/ports/out/attendance-days.ports.js";

/** Excel simples: título e subtítulo, linha em branco, cabeçalho e linhas (números ficam números). */
export class XlsxTableWriterAdapter implements TableWriterPort {
  xlsx(table: ExportTable): Buffer {
    const aoa: (string | number)[][] = [[table.title], [table.subtitle], [], table.columns, ...table.rows.map((r) => r.map(safeCell))];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet["!cols"] = table.columns.map((c, i) => ({ wch: Math.min(40, Math.max(c.length, ...table.rows.map((r) => String(r[i] ?? "").length)) + 2) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Relatório");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }
}
