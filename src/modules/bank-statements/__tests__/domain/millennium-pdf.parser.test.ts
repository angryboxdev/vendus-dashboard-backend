import { describe, it, expect } from "@jest/globals";
import { parseStatementPdf } from "../../domain/services/statement-pdf/statement-pdf-registry.js";
import type { PdfDocumentText, PdfTextItem } from "../../domain/services/statement-pdf/pdf-text.js";

/**
 * Extrato FICTÍCIO com o layout do «Extrato Combinado» do Millennium BCP (mesmas colunas e
 * posições; conta, IBAN, nomes e valores inventados). Cada linha: [y, [x, texto]…].
 */
type Row = [number, ...[number, string][]];
const page = (...rows: Row[]): PdfTextItem[] => rows.flatMap(([y, ...cells]) => cells.map(([x, str]) => ({ x, y, str })));

const TABLE_HEADER: Row[] = [
  [714, [57, "DATA"], [83, "DATA"]],
  [706, [117, "DESCRITIVO"], [355, "DEBITO"], [427, "CREDITO"], [529, "SALDO"]],
  [705, [57, "LANC."], [83, "VALOR"]],
];
const SIDE_TEXT: Row = [144, [13, "Banco Comercial Português, S.A., Sede: Rua Fictícia, 1, 0000-000 Porto"]];
const FOOTER: Row[] = [[88, [57, "GESTOR"], [90, "DE"], [105, "CLIENTE"], [144, ": NOME FICTICIO"]], [58, [57, "www.millenniumbcp.pt"]]];

function statement(overrides: { period?: [string, string]; closing?: [string, string] } = {}): PdfDocumentText {
  const [from, to] = overrides.period ?? ["2026/09/01", "2026/09/30"];
  const [closingK, closingU] = overrides.closing ?? ["2", "080.00"];
  return {
    pages: [
      page(
        [775, [69, "26/09/30"], [304, "CONTA:"], [362, "12345678901"], [426, "NIB:"], [459, "#S#"], [461, "003300001234567890101"], [554, "#E#"]],
        [628, [99, "EXTRATO COMBINADO"]],
        [607, [130, "N. 2026/009"]],
        [534, [370, "MOEDA"], [399, "BASE:"], [428, "EURO"]],
        [518, [368, "#S#"], [370, "IBAN:"], [399, "PT50"], [423, "0033"], [447, "0000"], [472, "1234"], [496, "5678"], [520, "9010"], [544, "1"], [549, "#E#"]],
        [455, [79, "DEPOSITOS"], [128, "A"], [137, "ORDEM"], [383, "2"], [392, "080.00"]],
        [431, [57, "Nos termos da legislação em vigor confirmamos que os depósitos são garantidos"]],
        [332, [57, "MENSAGEM"]],
        [312, [113, "**** Benefício M-Empresa Premium ****"]],
        [301, [113, "A partir de 01-12-2026 será incluído um novo benefício 123.45"]],
        [160, [57, "CONTA NEGOCIO EMP."], [448, "MOEDA:"], [487, "EUR"]],
        [159, [209, "N."], [219, "12345678901"]],
        SIDE_TEXT,
        [141, [57, "EXTRATO DE"], [114, from], [173, "A"], [184, to]],
        ...FOOTER,
      ),
      page(
        [775, [69, "26/09/30"], [304, "CONTA:"], [362, "12345678901"], [507, "PAG:"], [538, "00002"]],
        ...TABLE_HEADER,
        [696, [519, "1"], [528, "000.00"]],
        [695, [114, "SALDO INICIAL"]],
        // descrição 1 pt acima dos valores do mesmo movimento
        [685, [114, "CREDITO"], [148, "TPA"], [165, "BCP"], [186, "9999999"]],
        [684, [57, "9.01"], [87, "8.31"], [434, "369.08"], [518, "1"], [528, "369.08"]],
        [674, [57, "9.01"], [87, "9.01"], [114, "TARIFA"], [144, "MENSAL"], [361, "12.30"], [518, "1"], [528, "356.78"]],
        // milhares num bloco à parte; datas juntas num só bloco
        [663, [57, "9.02 9.02"], [114, "TRF"], [131, "P/"], [144, "FORNECEDOR"], [178, "FICTICIO"], [347, "1"], [356, "000.00"], [523, "356.78"]],
        SIDE_TEXT, // texto da margem a meio da tabela: ignorado, não corta a página
        [128, [114, "MDB9880"], [148, "LOJA"], [178, "EXEMPLO"]],
        [127, [57, "9.03"], [87, "9.03"], [366, "6.78"], [523, "350.00"]],
        [116, [117, "A TRANSPORTAR"], [523, "350.00"]],
        ...FOOTER,
      ),
      page(
        [775, [69, "26/09/30"], [304, "CONTA:"], [362, "12345678901"], [507, "PAG:"], [538, "00003"]],
        ...TABLE_HEADER,
        [696, [523, "350.00"]],
        [695, [115, "TRANSPORTE"]],
        [682, [114, "DD"], [127, "COMPANHIA"], [180, "DE"], [195, "AGUAS"]],
        [681, [57, "9.29"], [87, "9.29"], [361, "70.00"], [523, "280.00"]],
        [671, [114, "PT20110442 REF 0001"]], // continuação do descritivo anterior
        [660, [57, "9.30"], [87, "9.30"], [114, "STRIPE"], [413, "1"], [434, "800.00"], [518, "2"], [528, "080.00"]],
        [594, [114, "SALDO FINAL"], [518, closingK], [528, closingU]],
        [581, [114, "SALDO DISPONIVEL"], [518, "2"], [528, "080.00"]],
        ...FOOTER,
      ),
      // Página de publicidade: sem tabela.
      page([804, [220, "Millennium"], [347, "PME Líder"]], [255, [33, "4 NOV.2026"]], [157, [33, "O banco vai realizar um evento 9.01 100.00"]]),
    ],
  };
}

describe("Leitor de extratos Millennium BCP (PDF)", () => {
  it("lê metadados e só os movimentos da tabela — sem mensagens, texto legal, margem nem publicidade", () => {
    const s = parseStatementPdf(statement())!;
    expect(s).toMatchObject({
      template: "millennium_pdf",
      bankName: "Millennium BCP",
      accountNumber: "12345678901",
      nib: "003300001234567890101",
      iban: "PT50003300001234567890101",
      currency: "EUR",
      accountLabel: "CONTA NEGOCIO EMP.",
      statementNumber: "2026/009",
      openingBalance: 100_000,
      closingBalance: 208_000,
      issues: [],
    });
    expect(s.periodStart?.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(s.movements.map((m) => [m.bookingDate.toISOString().slice(0, 10), m.valueDate.toISOString().slice(0, 10), m.description, m.movementType, m.amount, m.balanceAfter])).toEqual([
      ["2026-09-01", "2026-08-31", "CREDITO TPA BCP 9999999", "credit", 36_908, 136_908],
      ["2026-09-01", "2026-09-01", "TARIFA MENSAL", "debit", 1_230, 135_678],
      ["2026-09-02", "2026-09-02", "TRF P/ FORNECEDOR FICTICIO", "debit", 100_000, 35_678],
      ["2026-09-03", "2026-09-03", "MDB9880 LOJA EXEMPLO", "debit", 678, 35_000],
      ["2026-09-29", "2026-09-29", "DD COMPANHIA DE AGUAS PT20110442 REF 0001", "debit", 7_000, 28_000],
      ["2026-09-30", "2026-09-30", "STRIPE", "credit", 180_000, 208_000],
    ]);
  });

  it("«A TRANSPORTAR» e «TRANSPORTE» nunca são movimentos", () => {
    const s = parseStatementPdf(statement())!;
    expect(s.movements.some((m) => /TRANSPORT/.test(m.description))).toBe(false);
  });

  it("saldo que não fecha → problema bloqueante (nunca grava valores errados)", () => {
    const s = parseStatementPdf(statement({ closing: ["2", "090.00"] }))!;
    expect(s.issues.filter((i) => i.blocking).map((i) => i.code)).toEqual(["closing_mismatch"]);
  });

  it("extrato de dezembro a janeiro: cada data fica no ano certo", () => {
    const s = parseStatementPdf(statement({ period: ["2025/12/29", "2026/01/30"] }))!;
    // as datas fictícias são de setembro → caem no ano mais próximo do período
    expect(s.movements[0]!.bookingDate.getUTCFullYear()).toBe(2025);
  });

  it("PDF de outro banco / layout desconhecido → não reconhecido", () => {
    expect(parseStatementPdf({ pages: [page([700, [50, "Extrato de conta"]], [680, [50, "Data Descrição Valor"]])] })).toBeNull();
  });
});
