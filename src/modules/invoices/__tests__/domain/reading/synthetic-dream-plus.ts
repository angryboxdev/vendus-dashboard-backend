import type { PdfContent, PdfWord } from "../../../domain/entities/invoice-reading.js";

/**
 * Réplica sintética do formato da fatura «FT 56892» (Dream Plus, programa PHC) — posições e valores
 * do documento real, mas fornecedor, NIF e ATCUD fictícios. Particularidades: quantidades com 3
 * casas («4,000» = 4), coluna logística «Qt/Cx» (não multiplica nada), desconto % por linha e quadro
 * de IVA com o cabeçalho «Taxa | Base de Incidência | Valor do I.V.A.» (sem «Taxa IVA»).
 */
// Largura média de um carácter na letra pequena da fatura (os títulos ficam a 7–10 pt uns dos outros).
const CHAR = 3.6;
type Cell = [x: number, text: string];
const row = (y: number, cells: Cell[]): PdfWord[] => cells.flatMap(([x, t]) => [...t.matchAll(/\S+/g)].map((m) => ({ text: m[0], x: x + m.index! * CHAR, y, width: m[0].length * CHAR })));

export const DREAM_QR = "A:599999993*B:999999990*C:PT*D:FT*E:N*F:20260907*G:FT 1/56892*H:ABCD1234-56892*I1:PT*I3:150.55*I4:9.03*I7:38.45*I8:8.84*N:17.87*O:206.87*Q:ab12*R:0006";

export function syntheticDreamPlus(qr: string | null = DREAM_QR): PdfContent {
  const words = [
    row(800, [[423, "Fatura Nº 56892"]]),
    row(788, [[545, "2ª VIA"]]),
    row(776, [[499, "Data: 2026-09-07"]]),
    row(752, [[306, "CLIENTE TESTE LDA"], [513, "Nº 2684"]]),
    row(740, [[46, "Fornecedor Teste - Comércio e Distribuição Produtos Alimentares Lda"]]),
    row(728, [[46, "Rua de Santa Teste, 7"], [306, "RUA DO CLIENTE 41"]]),
    row(716, [[46, "2780-101 Oeiras"], [306, "Contribuinte: 999999990"]]),
    row(704, [[95, "2785-656 S. Domingos de Rana"]]),
    row(692, [[46, "Contribuinte Nº: 599999993"]]),
    row(640, [[302, "Data de Vencimento: 22.09.2026"]]),
    row(610, [[50, "Referência"], [176, "Designação"], [291, "Lote"], [331, "Qtd."], [352, "Qt/Cx"], [378, "P. Unit."], [416, "Desc."], [449, "Desc. 2"], [493, "Tx IVA"], [549, "Total"]]),
    row(596, [[20, "0"], [42, "020051000R"], [113, "Q. Cheddar Ralado kg"], [289, "110826"], [334, "5,000"], [388, "8,20"], [417, "5,00%"], [493, "6,00%"], [551, "38,95"]]),
    row(584, [[20, "4"], [42, "44641004"], [113, "Q. Mozzarella ralado 100% Eurial kg"], [283, "H262084"], [330, "20,000"], [356, "2"], [388, "6,20"], [413, "10,00%"], [493, "6,00%"], [547, "111,60"]]),
    row(572, [[20, "8"], [42, "8005110551383"], [113, "Tomate Mutti p/ Pizza Classico 5 kg bolsa"], [297, "K083"], [334, "4,000"], [356, "2"], [384, "10,68"], [413, "10,00%"], [488, "23,00%"], [551, "38,45"]]),
    row(420, [[50, "Os artigos faturados/serviços prestados foram colocados à disposição do adquirente em 2026-09-08"]]),
    row(400, [[280, "ATCUD:ABCD1234-56892"]]),
    row(380, [[54, "Taxa"], [92, "Base de Incidência"], [176, "Valor do I.V.A."], [433, "Valores do Documento"]]),
    row(368, [[64, "6,00%"], [142, "150,55"], [217, "9,03"], [450, "Total Ilíquido:"], [545, "207,72"]]),
    row(356, [[60, "23,00%"], [146, "38,45"], [217, "8,84"]]),
    row(344, [[427, "Desconto Comercial:"], [549, "18,72"]]),
    row(332, [[60, "13,00%"]]),
    row(320, [[430, "Base de Incidência:"], [545, "189,00"]]),
    row(308, [[54, "TOTAL"], [142, "189,00"], [212, "17,87"]]),
    row(296, [[452, "Total de IVA:"], [549, "17,87"]]),
    row(270, [[426, "TOTAL (€)"], [533, "206,87"]]),
  ].flat();
  return { pages: [{ number: 1, width: 595, height: 842, words }], qrCodes: qr ? [{ page: 1, text: qr }] : [] };
}
