import * as XLSX from "xlsx";
import type { SalesDeclarationFileWriterPort } from "../../domain/ports/out/sales-declaration-file-writer.port.js";
import type { SalesDeclarationRow, SalesDeclarationStore } from "../../domain/entities/sales-declaration.js";

const SHEET_NAME = "SalesDeclaration";
const HEADERS = ["Business Unit Code", "Business Unit", "Company Name", "Store Number", "Contract", "Date", "Normal"];
const COLUMN_WIDTHS = [25.3, 25, 27.3, 18.6, 18.8, 13.5, 10.5];
const DATE_FORMAT = "m/d/yy";
/** Número de série do Excel para 1970-01-01 (base 1899-12-30). */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;

function toExcelSerial(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000 + EXCEL_EPOCH_OFFSET_DAYS;
}

/** Gera o .xlsx no layout do SalesReport do centro comercial (folha "SalesDeclaration"). */
export class XlsxSalesDeclarationWriterAdapter implements SalesDeclarationFileWriterPort {
  write(store: SalesDeclarationStore, rows: SalesDeclarationRow[]): Buffer {
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS]);

    rows.forEach((row, i) => {
      const r = i + 1; // linha 0 é o cabeçalho
      const fixed = [store.businessUnitCode, store.businessUnit, store.companyName, store.storeNumber, store.contract];
      fixed.forEach((value, c) => {
        sheet[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: value };
      });
      sheet[XLSX.utils.encode_cell({ r, c: 5 })] = { t: "n", v: toExcelSerial(row.date), z: DATE_FORMAT };
      sheet[XLSX.utils.encode_cell({ r, c: 6 })] = { t: "n", v: row.normalCents / 100 };
    });

    sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: HEADERS.length - 1 } });
    sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }
}
