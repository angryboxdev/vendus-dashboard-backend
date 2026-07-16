import type { ParsedMovement } from "../../domain/ports/in/bank-statement.ports.js";

export interface ParsedStatement {
  bankName: string | null;
  accountNumber: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  openingBalance: number | null; // cents
  closingBalance: number | null; // cents
  movements: ParsedMovement[];
}

export class ParseError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ParseError";
  }
}

/**
 * Parses a Portuguese bank CSV file (UTF-8 or ISO-8859-1).
 *
 * Supported column mappings (case-insensitive, accents normalised):
 *   date:        "Data mov.", "Data Lançamento", "Data"
 *   valueDate:   "Data valor", "Data Valor"
 *   description: "Descrição", "Descricao"
 *   debit:       "Débito", "Debito"
 *   credit:      "Crédito", "Credito"
 *   valor:       "Montante", "Valor"  (single signed column: positive=credit, negative=debit)
 *   balance:     "Saldo"  (optional — XLSX format omits it)
 *
 * Metadata rows (XLSX format): "Conta", "Data de inicio", "Data fim" are extracted
 * from pre-header rows to populate accountNumber and period.
 *
 * Amount format: Portuguese decimal (1.234,56 → 123456 cents).
 * Date format:   DD-MM-YYYY or DD/MM/YYYY.
 */
export class CsvStatementParser {
  parse(buffer: Buffer): ParsedStatement {
    const text = this.decode(buffer);
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) throw new ParseError("CSV file is empty");

    const separator = this.detectSeparator(lines[0]!);
    const { headerIndex, columns } = this.findHeaderRow(lines, separator);

    if (headerIndex === -1) {
      throw new ParseError(
        "Could not find column header row. Expected columns: Data, Descrição, Débito/Crédito, Saldo"
      );
    }

    // Extract metadata (accountNumber, period) from rows before the header
    const preHeader = lines.slice(0, headerIndex);
    const accountNumber = this.extractAccountNumber(preHeader, separator);
    const { periodStart: metaPeriodStart, periodEnd: metaPeriodEnd } =
      this.extractPeriodFromMetadata(preHeader, separator);

    const movements: ParsedMovement[] = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line || line.replace(new RegExp(`[${separator};]`, "g"), "").trim() === "") {
        continue;
      }
      const fields = this.splitLine(line, separator);
      const movement = this.parseMovementRow(fields, columns);
      if (movement) movements.push(movement);
    }

    if (movements.length === 0) {
      throw new ParseError("No movements found in CSV file");
    }

    const hasSaldo = columns.balance !== undefined && columns.balance >= 0;

    // Infer balances only when Saldo column is present
    let openingBalance: number | null = null;
    let closingBalance: number | null = null;
    if (hasSaldo) {
      const lastMovement = movements[movements.length - 1]!;
      const firstMovement = movements[0]!;
      closingBalance = lastMovement.balanceAfter;
      const firstNet =
        firstMovement.movementType === "credit"
          ? firstMovement.amount
          : -firstMovement.amount;
      openingBalance = firstMovement.balanceAfter - firstNet;

      // Guard: verify that opening + movements ≈ closing (tolerance: 1 cent per movement)
      const calculated = movements.reduce(
        (acc, m) => acc + (m.movementType === "credit" ? m.amount : -m.amount),
        openingBalance
      );
      const drift = Math.abs(calculated - closingBalance);
      const toleranceCents = Math.max(100, movements.length); // at least 1€ or 1 cent/movement
      if (drift > toleranceCents) {
        throw new ParseError(
          `Balance mismatch after parsing: calculated closing balance is ${(calculated / 100).toFixed(2)} ` +
          `but statement shows ${(closingBalance / 100).toFixed(2)} ` +
          `(difference: ${(drift / 100).toFixed(2)}). ` +
          `This likely means some amounts were parsed incorrectly. ` +
          `Please verify the file format.`
        );
      }
    }

    // Period: prefer metadata rows (XLSX format), fall back to movement dates
    const dates = movements.map((m) => m.bookingDate.getTime());
    const periodStart = metaPeriodStart ?? new Date(Math.min(...dates));
    const periodEnd = metaPeriodEnd ?? new Date(Math.max(...dates));

    return {
      bankName: null,
      accountNumber,
      periodStart,
      periodEnd,
      openingBalance,
      closingBalance,
      movements,
    };
  }

  private decode(buffer: Buffer): string {
    // Try UTF-8 first; fall back to latin1 (covers ISO-8859-1 / Windows-1252 basic chars)
    const utf8 = buffer.toString("utf-8");
    // Simple heuristic: if replacement character is present, try latin1
    if (utf8.includes("\uFFFD")) {
      return buffer.toString("latin1");
    }
    return utf8;
  }

  private detectSeparator(firstLine: string): string {
    const semicolons = (firstLine.match(/;/g) ?? []).length;
    const commas = (firstLine.match(/,/g) ?? []).length;
    return semicolons >= commas ? ";" : ",";
  }

  private splitLine(line: string, sep: string): string[] {
    return line.split(sep).map((f) => f.trim().replace(/^"|"$/g, ""));
  }

  private normalise(s: string): string {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  private findHeaderRow(
    lines: string[],
    sep: string
  ): { headerIndex: number; columns: Record<string, number> } {
    for (let i = 0; i < lines.length; i++) {
      const fields = this.splitLine(lines[i]!, sep).map((f) => this.normalise(f));

      // Date column: CSV uses "data mov.", XLSX uses "data lancamento"
      const dateIdx = fields.findIndex((f) =>
        ["data mov.", "data mov", "data lancamento", "data lançamento", "data"].includes(f)
      );
      // Description column
      const descIdx = fields.findIndex((f) => f === "descricao");
      // Balance column (optional in XLSX format)
      const saldoIdx = fields.findIndex((f) => f === "saldo");

      // Require at least a date and a description column
      if (dateIdx !== -1 && descIdx !== -1) {
        const columns: Record<string, number> = {
          date: dateIdx,
          valueDate: fields.findIndex((f) =>
            ["data valor", "data val."].includes(f)
          ),
          description: descIdx,
          debit: fields.findIndex((f) => f === "debito"),
          credit: fields.findIndex((f) => f === "credito"),
          balance: saldoIdx,
        };

        // Single signed column: "Montante" (XLSX) or "Valor" (some CSVs)
        if (columns.debit === -1 && columns.credit === -1) {
          const valorIdx = fields.findIndex((f) =>
            ["montante", "valor"].includes(f)
          );
          if (valorIdx !== -1) {
            columns.valor = valorIdx;
          }
        }

        return { headerIndex: i, columns };
      }
    }
    return { headerIndex: -1, columns: {} };
  }

  private extractAccountNumber(lines: string[], sep: string): string | null {
    for (const line of lines) {
      const fields = this.splitLine(line, sep);
      for (const field of fields) {
        const clean = field.replace(/\s/g, "");
        // Portuguese IBANs: PT + 23 digits
        if (/^PT\d{23}$/.test(clean)) return clean;
        // Numeric account, possibly with " - EUR" suffix (XLSX format: "0000045797093352 - EUR")
        const numMatch = field.match(/^(\d{10,20})\s*(?:-\s*\w+)?$/);
        if (numMatch) return numMatch[1]!;
      }
    }
    return null;
  }

  private extractPeriodFromMetadata(
    lines: string[],
    sep: string
  ): { periodStart: Date | null; periodEnd: Date | null } {
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    for (const line of lines) {
      const fields = this.splitLine(line, sep);
      if (fields.length < 2) continue;
      const label = this.normalise(fields[0]!);
      const value = (fields[1] ?? "").trim();
      if (!value) continue;
      if (["data de inicio", "data inicio", "data de início"].includes(label)) {
        try { periodStart = this.parseDate(value); } catch { /* ignore */ }
      }
      if (["data fim", "data de fim"].includes(label)) {
        try { periodEnd = this.parseDate(value); } catch { /* ignore */ }
      }
    }
    return { periodStart, periodEnd };
  }

  private parseMovementRow(
    fields: string[],
    columns: Record<string, number>
  ): ParsedMovement | null {
    const get = (key: string): string =>
      columns[key] !== undefined && columns[key]! >= 0
        ? (fields[columns[key]!] ?? "").trim()
        : "";

    const dateStr = get("date");
    const descStr = get("description");
    const balStr = get("balance");

    if (!dateStr || !descStr) return null;

    let bookingDate: Date;
    try {
      bookingDate = this.parseDate(dateStr);
    } catch {
      return null;
    }

    const valueDateStr = get("valueDate");
    const valueDate = valueDateStr ? this.parseDate(valueDateStr) : bookingDate;

    // balanceAfter is optional (XLSX format omits Saldo)
    const balanceAfter = balStr ? (this.parseAmount(balStr) ?? 0) : 0;

    let amount: number;
    let movementType: "debit" | "credit";

    if (columns.valor !== undefined && columns.valor >= 0) {
      // Single signed column (Montante / Valor): negative = debit, positive = credit.
      // Check sign from the raw string before parseAmount strips it via Math.abs.
      const rawStr = get("valor");
      const isNegative = rawStr.trim().startsWith("-");
      const absAmount = this.parseAmount(rawStr);
      if (absAmount === null || absAmount === 0) return null;
      amount = absAmount;
      movementType = isNegative ? "debit" : "credit";
    } else {
      const debitStr = get("debit");
      const creditStr = get("credit");
      const debit = debitStr ? this.parseAmount(debitStr) : null;
      const credit = creditStr ? this.parseAmount(creditStr) : null;

      if (credit !== null && credit > 0) {
        amount = credit;
        movementType = "credit";
      } else if (debit !== null && debit > 0) {
        amount = debit;
        movementType = "debit";
      } else {
        return null; // Cannot determine direction
      }
    }

    return { bookingDate, valueDate, description: descStr, amount, balanceAfter, movementType };
  }

  /**
   * Parses a Portuguese-formatted amount string to cents.
   *
   * Handles both European (1.078,27) and English (1,078.27) formats by
   * comparing the position of the last comma vs the last dot:
   *   - lastComma > lastDot  → European: dot=thousands, comma=decimal
   *   - lastDot   > lastComma → English:  comma=thousands, dot=decimal
   *   - only comma → if exactly 3 digits after → thousands; else → decimal
   *   - only dot   → if exactly 3 digits after → thousands; else → decimal
   *
   * Examples: "1.078,27" → 107827 | "1,078.27" → 107827 | "-1 078,27" → 107827
   */
  private parseAmount(raw: string): number | null {
    if (!raw || raw.trim() === "") return null;

    // Remove spaces (thousands sep in some locales) and currency symbols
    const cleaned = raw.trim().replace(/[\s\u00a0€$£]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === "+") return null;

    // Strip sign — we only need absolute value (movementType carries the direction)
    const digits = cleaned.replace(/^[+-]/, "");

    const lastComma = digits.lastIndexOf(",");
    const lastDot   = digits.lastIndexOf(".");

    let normalised: string;

    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        // European format: 1.078,27 → dot=thousands, comma=decimal
        normalised = digits.replace(/\./g, "").replace(",", ".");
      } else {
        // English format: 1,078.27 → comma=thousands, dot=decimal
        normalised = digits.replace(/,/g, "");
      }
    } else if (lastComma !== -1) {
      // Only comma: 3 digits after → thousands sep (1,000); otherwise → decimal (1,08)
      const afterComma = digits.slice(lastComma + 1);
      if (afterComma.length === 3 && /^\d+$/.test(afterComma)) {
        normalised = digits.replace(/,/g, "");
      } else {
        normalised = digits.replace(",", ".");
      }
    } else if (lastDot !== -1) {
      // Only dot: 3 digits after → thousands sep (1.000); otherwise → decimal (1.08)
      const afterDot = digits.slice(lastDot + 1);
      if (afterDot.length === 3 && /^\d+$/.test(afterDot)) {
        normalised = digits.replace(/\./g, "");
      } else {
        normalised = digits;
      }
    } else {
      normalised = digits;
    }

    const value = parseFloat(normalised);
    if (isNaN(value)) return null;
    return Math.round(value * 100);
  }

  /**
   * Parses DD-MM-YYYY or DD/MM/YYYY date strings.
   */
  private parseDate(raw: string): Date {
    const parts = raw.trim().split(/[-\/]/);
    if (parts.length !== 3) throw new Error(`Invalid date: ${raw}`);
    const [day, month, year] = parts;
    const iso = `${year!.padStart(4, "20")}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
    const d = new Date(`${iso}T00:00:00.000Z`);
    if (isNaN(d.getTime())) throw new Error(`Invalid date: ${raw}`);
    return d;
  }
}
