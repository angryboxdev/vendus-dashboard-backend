import type { ParsedMovement } from "../../domain/ports/in/bank-statement.ports.js";
import { ParseError, type ParsedStatement } from "./csv-statement-parser.adapter.js";

/**
 * «Relatório de movimentos» do Millennium BCP em TXT (largura fixa, ISO-8859-1) — o único formato que
 * dá para importar um mês ainda em curso com os saldos verdadeiros (pedido de 2026-10-28):
 *
 *   11 … início(aammdd)@20 fim(aammdd)@26 sinal@32 saldo inicial(14, cêntimos)@33
 *   22 … data movimento(aammdd)@10 data valor@16 «99» código(4)@24 valor(14, cêntimos)@28 referência…
 *   23 … descrição@4
 *   33 … nº saídas(5)@20 total saídas(14)@25 nº entradas(5)@39 total entradas(14)@44 sinal@58 saldo final(14)@59
 *   88 … fim
 *
 * O sentido vem do último dígito do código da operação (1 = saída, 2 = entrada); a leitura só passa se
 * as contagens e os totais do rodapé baterem e se saldo inicial + entradas − saídas = saldo final. A
 * referência a seguir ao valor (pode trazer o NIF) nunca se guarda. Sinal dos saldos: 2 = positivo,
 * 1 = negativo.
 */
export class MillenniumTxtStatementParser {
  /** É este formato? (registo 11 no início e rodapé 33). */
  static matches(text: string): boolean {
    return /^11\d{49}/.test(text) && /^33\d{20}/m.test(text);
  }

  parse(buffer: Buffer): ParsedStatement {
    const lines = buffer.toString("latin1").split(/\r?\n/);
    const header = lines[0] ?? "";
    const footer = lines.find((l) => l.startsWith("33"));
    if (!/^11\d{49}/.test(header) || !footer) throw new ParseError("Relatório de movimentos (TXT) não reconhecido");

    const date = (s: string): Date => {
      if (!/^\d{6}$/.test(s)) throw new ParseError(`Data inválida no relatório: ${s}`);
      return new Date(Date.UTC(2000 + Number(s.slice(0, 2)), Number(s.slice(2, 4)) - 1, Number(s.slice(4, 6))));
    };
    const cents = (s: string): number => {
      if (!/^\d{14}$/.test(s)) throw new ParseError(`Valor inválido no relatório: ${s}`);
      return Number(s);
    };
    const signed = (sign: string, value: number) => (sign === "1" ? -value : value);

    const openingBalance = signed(header[32]!, cents(header.slice(33, 47)));
    const movements: ParsedMovement[] = [];
    let running = openingBalance;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.startsWith("22")) continue;
      const next = lines[i + 1] ?? "";
      const code = l.slice(24, 28);
      const kind = code.at(-1);
      if (kind !== "1" && kind !== "2") throw new ParseError(`Código de operação desconhecido no relatório: ${code}`);
      const amount = cents(l.slice(28, 42));
      const movementType = kind === "2" ? "credit" : "debit";
      running += movementType === "credit" ? amount : -amount;
      movements.push({
        bookingDate: date(l.slice(10, 16)),
        valueDate: date(l.slice(16, 22)),
        description: next.startsWith("23") ? next.slice(4).trim().replace(/\s+/g, " ") : "",
        amount,
        movementType,
        balanceAfter: running,
      });
    }

    const debitCount = Number(footer.slice(20, 25));
    const debitTotal = cents(footer.slice(25, 39));
    const creditCount = Number(footer.slice(39, 44));
    const creditTotal = cents(footer.slice(44, 58));
    const closingBalance = signed(footer[58]!, cents(footer.slice(59, 73)));
    const debits = movements.filter((m) => m.movementType === "debit");
    const credits = movements.filter((m) => m.movementType === "credit");
    const sum = (ms: ParsedMovement[]) => ms.reduce((a, m) => a + m.amount, 0);
    if (debits.length !== debitCount || credits.length !== creditCount || sum(debits) !== debitTotal || sum(credits) !== creditTotal) {
      throw new ParseError("O relatório não confere com os totais do próprio ficheiro (entradas/saídas): não foi importado.");
    }
    if (openingBalance + creditTotal - debitTotal !== closingBalance || running !== closingBalance) {
      throw new ParseError("Os saldos do relatório não fecham (inicial + entradas − saídas ≠ final): não foi importado.");
    }

    return {
      bankName: "Millennium BCP",
      // Só os últimos 10 dígitos coincidem com o nº de conta dos outros formatos; a conta escolhida no ecrã manda.
      accountNumber: header.slice(10, 20),
      periodStart: date(header.slice(20, 26)),
      periodEnd: date(header.slice(26, 32)),
      openingBalance,
      closingBalance,
      movements,
    };
  }
}
