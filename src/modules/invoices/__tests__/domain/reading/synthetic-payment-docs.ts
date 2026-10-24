import type { PdfContent, PdfWord } from "../../../domain/entities/invoice-reading.js";

/** Documentos AT/SS sintéticos (todos os valores fictícios; só o formato é real). */

const CHAR = 4.2;
type Row = [y: number, cells: [x: number, text: string][]];
const toWords = (rows: Row[]): PdfWord[] =>
  rows.flatMap(([y, cells]) => cells.flatMap(([x, text]) => [...text.matchAll(/\S+/g)].map((m) => ({ text: m[0], x: x + m.index! * CHAR, y, width: m[0].length * CHAR }))));
const doc = (rows: Row[]): PdfContent => ({ pages: [{ number: 1, width: 595, height: 842, words: toWords(rows) }], qrCodes: [] });

export const AT_BARCODE = "12345678901234567890123456789012345678901";

export function syntheticAt(over: { amount?: string; importancia?: string; reference?: string; due?: string; printed?: string | null; nif?: string; taxLines?: [string, string][] } = {}): PdfContent {
  const taxLines = over.taxLines ?? [["104 - IRS - Prediais", over.amount ?? "250,00"]];
  return doc([
    [767, [[308, "DECLARAÇÃO DE RETENÇÕES NA FONTE"]]],
    [764, [[128, "MINISTÉRIO DAS FINANÇAS"]]],
    [754, [[128, "AUTORIDADE TRIBUTÁRIA E ADUANEIRA"]]],
    [732, [[124, "NÚMERO DO DOCUMENTO"], [318, "NÚMERO DE IDENTIFICAÇÃO FISCAL"]]],
    [708, [[132, "12345678901"], [355, over.nif ?? "999999990"]]],
    [669, [[280, "EMPRESA TESTE, LDA."]]],
    [621, [[118, "ZONA"], [228, "CÓDIGO"], [402, "IMPORTÂNCIA"]]],
    ...taxLines.map(([label, v], i): Row => [602 - i * 18, [[113, "Continente"], [187, label], [456, v]]]),
    [387, [[108, "PERÍODO"], [178, "2026 / outubro"], [297, "VALOR A PAGAR"], [447, over.amount ?? "250,00"]]],
    [360, [[83, "Total de páginas:"], [149, "1"], [273, "Data e hora da recepção da declaração:"], [415, "2026-11-05 10:00:00"]]],
    [338, [[99, "Referência para pagamento"]]],
    [321, [[117, over.reference ?? "123.456.789.012.345"]]],
    [305, [[116, "Importância a pagar"]]],
    [289, [[145, `€ ${over.importancia ?? over.amount ?? "250,00"}`]]],
    [273, [[104, "Data limite de pagamento"]]],
    [257, [[138, over.due ?? "2026-11-20"]]],
    ...(over.printed === null ? [] : [[204, [[176, over.printed ?? AT_BARCODE]]] as Row]),
  ]);
}

export function syntheticSs(over: { total?: string; mbValue?: string; detail?: [string, string, string, string][]; validity?: string } = {}): PdfContent {
  const detail = over.detail ?? [["202610", "88,50", "0,00", "88,50"]];
  return doc([
    [718, [[208, "REFERÊNCIA PARA PAGAMENTO"]]],
    [667, [[65, "Nome"], [373, "Data de emissão"], [457, "Data de validade"]]],
    [653, [[65, "EMPRESA TESTE, LDA."], [373, "2026-11-10"], [457, over.validity ?? "2026-11-24"]]],
    [633, [[65, "Número de Identificação de Segurança Social (NISS)"]]],
    [618, [[65, "12345678901"]]],
    [601, [[65, "Número de Identificação Fiscal (NIF)"]]],
    [587, [[65, "999999990"]]],
    [519, [[99, "Multibanco"]]],
    [480, [[65, "Entidade"], [227, "Referência"], [397, "Valor"]]],
    [466, [[65, "12345"], [227, "098765432"], [397, `${over.mbValue ?? over.total ?? "88,50"}€`]]],
    [381, [[57, "Contribuições - Entidade Empregadora"]]],
    ...detail.map(([p, v, j, t], i): Row => [348 - i * 17, [[60, `${p} - Contribuições - Entidade Empregadora.`], [388, v], [459, j], [510, t]]]),
    [312, [[454, "Total a pagar"], [503, `${over.total ?? "88,50"}€`]]],
    [172, [[57, 'entre em "Links úteis", escolha "Obter documento" e depois insira o seguinte código de acesso:']]],
    [161, [[57, "9-zzzz-yyyy-xxxx"], [189, "Válido até: 2026-11-24"]]],
    [42, [[57, "Os dados deste documento constam do Sistema de Informação da Segurança Social à data da sua emissão."]]],
  ]);
}

/** Comprovativo de pagamento (não é uma obrigação). */
export const syntheticReceipt = (): PdfContent =>
  doc([
    [700, [[60, "COMPROVATIVO DE PAGAMENTO"]]],
    [680, [[60, "Segurança Social — Contribuições"]]],
    [660, [[60, "Multibanco"], [300, "Valor pago 88,50€"]]],
  ]);
