import { describe, expect, it } from "@jest/globals";
import { ParseError } from "../../adapters/out/csv-statement-parser.adapter.js";
import { MillenniumTxtStatementParser } from "../../adapters/out/millennium-txt-statement-parser.adapter.js";

// «Relatório de movimentos» fictício no formato do Millennium (conta, descrições e valores inventados).
const n = (v: number, width: number) => String(v).padStart(width, "0");
const ACCOUNT = "00330000001234567890";
const header = (opening: number) => `11${ACCOUNT.slice(0, 18)}261001261028${opening < 0 ? "1" : "2"}${n(Math.abs(opening), 14)}9783`.padEnd(80);
const mov = (yymmdd: string, code: string, cents: number, desc: string, reference = "000000000000000000000") => [
  `22    0000${yymmdd}${yymmdd}99${code}${n(cents, 14)}${reference}`.padEnd(80),
  `2301${desc}`.padEnd(80),
];
const footer = (debits: number[], credits: number[], closing: number) =>
  `33${ACCOUNT.slice(0, 18)}${n(debits.length, 5)}${n(debits.reduce((a, b) => a + b, 0), 14)}${n(credits.length, 5)}${n(credits.reduce((a, b) => a + b, 0), 14)}${closing < 0 ? "1" : "2"}${n(Math.abs(closing), 14)}978`.padEnd(80);

function file(opening = 100_000, closing = 100_000 + 50_000 - 12_345 - 2_000): Buffer {
  return Buffer.from(
    [
      header(opening),
      ...mov("261001", "0052", 50_000, "CREDITO TPA TESTE 1234"),
      ...mov("261002", "0061", 12_345, "MDB0000 LOJA FICTICIA", "000000000000123456789"),
      ...mov("261028", "0911", 2_000, "TARIFA TESTE"),
      footer([12_345, 2_000], [50_000], closing),
      "88999999999999999999000006".padEnd(80),
    ].join("\r\n"),
    "latin1",
  );
}

describe("MillenniumTxtStatementParser", () => {
  it("lê o período, os saldos e os movimentos (sentido pelo código: …2 entrada, …1 saída), com o saldo corrido", () => {
    const text = file().toString("latin1");
    expect(MillenniumTxtStatementParser.matches(text)).toBe(true);
    const p = new MillenniumTxtStatementParser().parse(file());
    expect(p).toMatchObject({
      bankName: "Millennium BCP",
      openingBalance: 100_000,
      closingBalance: 135_655,
      periodStart: new Date("2026-10-01T00:00:00Z"),
      periodEnd: new Date("2026-10-28T00:00:00Z"),
    });
    expect(p.movements.map((m) => [m.bookingDate.toISOString().slice(0, 10), m.movementType, m.amount, m.balanceAfter, m.description])).toEqual([
      ["2026-10-01", "credit", 50_000, 150_000, "CREDITO TPA TESTE 1234"],
      ["2026-10-02", "debit", 12_345, 137_655, "MDB0000 LOJA FICTICIA"],
      ["2026-10-28", "debit", 2_000, 135_655, "TARIFA TESTE"],
    ]);
    // A referência a seguir ao valor (pode trazer o NIF) nunca é lida.
    expect(JSON.stringify(p)).not.toContain("123456789");
  });

  it("recusa um relatório cujos saldos ou totais não conferem", () => {
    expect(() => new MillenniumTxtStatementParser().parse(file(100_000, 999_999))).toThrow(ParseError);
    expect(() => new MillenniumTxtStatementParser().parse(Buffer.from("isto não é um relatório"))).toThrow(/não reconhecido/);
  });
});
