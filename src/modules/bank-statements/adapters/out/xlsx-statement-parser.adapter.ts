import * as XLSX from "xlsx";
import { CsvStatementParser, ParseError } from "./csv-statement-parser.adapter.js";
import type { ParsedStatement } from "./csv-statement-parser.adapter.js";

/**
 * Parses a Portuguese bank XLSX file.
 *
 * Strategy: read the first sheet via SheetJS, convert it to CSV (semicolon-separated),
 * then delegate to CsvStatementParser — reusing all header detection, amount parsing,
 * date parsing and balance inference logic.
 */
export class XlsxStatementParser {
  private readonly csvParser = new CsvStatementParser();

  parse(buffer: Buffer): ParsedStatement {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    } catch {
      throw new ParseError("Invalid or corrupted XLSX file");
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new ParseError("XLSX file contains no sheets");

    const sheet = workbook.Sheets[sheetName]!;

    // Convert to semicolon-separated CSV so the existing parser handles all the logic.
    // raw: false → formatted cell values (so numbers keep their Portuguese locale formatting).
    // We use FS ";" because Portuguese CSVs use semicolons and the parser already handles both.
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ";", rawNumbers: false });

    return this.csvParser.parse(Buffer.from(csv, "utf-8"));
  }
}
