import type { ParsedMovement } from "../../ports/in/bank-statement.ports.js";
import type { ParsedBankStatement, StatementReadIssue } from "./parsed-statement.js";
import { documentLines, type PdfDocumentText, type PdfLine, type PdfTextItem } from "./pdf-text.js";

/**
 * Extrato «EXTRATO COMBINADO» do Millennium BCP em PDF (task V2 §8).
 *
 * Lê por posição, nunca por IA: a tabela de movimentos tem colunas fixas (DATA LANC. | DATA VALOR |
 * DESCRITIVO | DEBITO | CREDITO | SALDO), cujas posições se tiram do próprio cabeçalho da tabela.
 * Tudo o que está fora da tabela — mensagens e campanhas do banco, texto legal, gestor de cliente,
 * rodapés, páginas de publicidade — é ignorado. «SALDO INICIAL» e «SALDO FINAL» dão os saldos;
 * «A TRANSPORTAR»/«TRANSPORTE» só servem para conferir a passagem de página, nunca são movimentos.
 * Cada movimento traz o saldo após ele: a cadeia de saldos valida a leitura (se não fechar, a
 * importação é bloqueada em vez de gravar valores errados).
 */

const DATE_TOKEN = /^\d{1,2}\.\d{2}$/;
const NUMBER_TOKEN = /^-?[\d.]+-?$/;
// Rodapé da página (depois da tabela). O texto lateral do banco («Banco Comercial Português, S.A.,
// Sede…», «Capital Social…») é escrito na margem esquerda à altura da tabela: ignora-se pela posição
// (`marginMaxX`), não pode parar a leitura — senão perdiam-se os últimos movimentos da página.
const STOP_LINES = [/^GESTOR DE CLIENTE/i, /^www\.millenniumbcp\.pt/i];

export function isMillenniumStatement(doc: PdfDocumentText): boolean {
  const text = documentLines(doc).flat().map((l) => l.text).join("\n");
  return /EXTRATO COMBINADO/.test(text) && /millenniumbcp|Banco Comercial Portugu/i.test(text) && /DESCRITIVO/.test(text);
}

interface Columns {
  /** À esquerda disto é margem (texto lateral do banco), não tabela. */
  marginMaxX: number;
  descMinX: number;
  amountMinX: number; // a partir daqui só valores (débito, crédito, saldo)
  creditMinX: number;
  balanceMinX: number;
}

function findColumns(lines: PdfLine[]): Columns | null {
  const header = lines.find((l) => l.items.some((i) => i.str.trim() === "DEBITO") && l.items.some((i) => i.str.trim() === "SALDO"));
  if (!header) return null;
  const x = (label: string) => header.items.find((i) => i.str.trim() === label)?.x;
  const desc = x("DESCRITIVO");
  const debit = x("DEBITO");
  const credit = x("CREDITO");
  const balance = x("SALDO");
  if (desc === undefined || debit === undefined || credit === undefined || balance === undefined) return null;
  // A coluna das datas começa ~60 pt antes do DESCRITIVO; a margem lateral fica bem à esquerda disso.
  const dateX = desc - 60;
  // Valores alinhados à direita: começam antes do título e o bloco dos milhares («12» «792.39») ainda
  // mais à esquerda — as fronteiras ficam entre colunas, não junto ao título.
  // Valores ≥ 100 000 («160» «000.00») começam ~30 pt antes do título: a fronteira entre colunas fica a
  // meio caminho entre títulos, e os débitos começam 30 pt antes do «DEBITO».
  return {
    marginMaxX: dateX - 15,
    descMinX: desc - 12,
    amountMinX: debit - 30,
    creditMinX: (debit + credit) / 2 + 5,
    balanceMinX: (credit + balance) / 2,
  };
}

/** «1» «350.00» (o milhar vem num bloco à parte) → 135000 cêntimos; sinal «-» antes ou depois. */
function amountCents(tokens: PdfTextItem[]): number | null {
  if (tokens.length === 0) return null;
  const raw = tokens.map((t) => t.str.trim()).join("");
  const negative = raw.startsWith("-") || raw.endsWith("-");
  const digits = raw.replace(/-/g, "");
  if (!/^\d+\.\d{2}$/.test(digits)) return null;
  const cents = Math.round(Number(digits) * 100);
  return negative ? -cents : cents;
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** «9.01» → data no ano do período (um extrato de dezembro a janeiro escolhe o ano certo). */
function resolveDate(token: string, periodStart: Date | null, periodEnd: Date | null): Date | null {
  const [m, d] = token.split(".").map(Number);
  if (!m || !d || m > 12 || d > 31) return null;
  const years = [...new Set([periodStart?.getUTCFullYear(), periodEnd?.getUTCFullYear()].filter((y): y is number => y !== undefined))];
  if (years.length === 0) return null;
  const slack = 31 * 86_400_000;
  for (const y of years) {
    const date = utcDate(y, m, d);
    if (periodStart && periodEnd && date.getTime() >= periodStart.getTime() - slack && date.getTime() <= periodEnd.getTime() + slack) return date;
  }
  return utcDate(years[0]!, m, d);
}

function readMetadata(lines: PdfLine[]) {
  const texts = lines.map((l) => l.text);
  const afterToken = (label: string) => {
    for (const l of lines) {
      const i = l.items.findIndex((it) => it.str.trim() === label);
      if (i >= 0) {
        const next = l.items.slice(i + 1).map((it) => it.str.replace(/#[SE]#/g, "").trim()).find((s) => s !== "");
        if (next) return next;
      }
    }
    return null;
  };
  const period = texts.map((t) => /EXTRATO DE (\d{4})\/(\d{2})\/(\d{2}) A (\d{4})\/(\d{2})\/(\d{2})/.exec(t)).find(Boolean);
  const ibanLine = lines.find((l) => l.items.some((i) => i.str.trim() === "IBAN:"));
  const iban = ibanLine
    ? ibanLine.items
        .slice(ibanLine.items.findIndex((i) => i.str.trim() === "IBAN:") + 1)
        .map((i) => i.str.replace(/#[SE]#/g, "").trim())
        .join("")
        .replace(/\s+/g, "") || null
    : null;
  const number = texts.map((t) => /^N\. (\d{4}\/\d{3})$/.exec(t)).find(Boolean);
  // «CONTA NEGOCIO EMP.» e «N. 45797093352» ficam a 1 pt e juntam-se na mesma linha.
  const label = texts.map((t) => /^(CONTA [A-Z0-9 .]+?)(?:\s+N\.\s*\d+)?\s+MOEDA:/.exec(t)).find(Boolean);
  const currency = afterToken("MOEDA:");
  const nib = afterToken("NIB:");
  return {
    accountNumber: afterToken("CONTA:"),
    nib: nib && /^\d+$/.test(nib) ? nib : null,
    iban: iban && /^[A-Z]{2}\d{2}[0-9A-Z]+$/.test(iban) ? iban : null,
    statementNumber: number?.[1] ?? null,
    accountLabel: label?.[1]?.trim() ?? null,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : "EUR",
    periodStart: period ? utcDate(Number(period[1]), Number(period[2]), Number(period[3])) : null,
    periodEnd: period ? utcDate(Number(period[4]), Number(period[5]), Number(period[6])) : null,
  };
}

export function parseMillenniumStatement(doc: PdfDocumentText): ParsedBankStatement {
  const pages = documentLines(doc);
  const meta = readMetadata(pages.flat());
  const issues: StatementReadIssue[] = [];
  const movements: ParsedMovement[] = [];
  let opening: number | null = null;
  let closing: number | null = null;
  let carried: number | null = null;
  let done = false;

  for (const lines of pages) {
    if (done) break;
    const columns = findColumns(lines);
    if (!columns) continue; // página sem tabela (resumo, publicidade)
    const headerIndex = lines.findIndex((l) => l.items.some((i) => i.str.trim() === "DESCRITIVO"));

    for (const rawLine of lines.slice(headerIndex + 1)) {
      const items = rawLine.items.filter((i) => i.x >= columns.marginMaxX);
      if (items.length === 0) continue; // só texto da margem
      const line: PdfLine = { y: rawLine.y, items, text: items.map((i) => i.str.trim()).join(" ") };
      if (STOP_LINES.some((re) => re.test(line.text))) break; // rodapé da página
      // Cabeçalho da tabela partido em várias linhas (DATA / LANC. VALOR).
      if (/^(DATA|LANC\.)\b/.test(line.text) && !line.items.some((i) => DATE_TOKEN.test(i.str.trim().split(/\s+/)[0] ?? ""))) continue;

      const dateItems = line.items.filter((i) => i.x < columns.descMinX);
      const dates = dateItems.flatMap((i) => i.str.trim().split(/\s+/)).filter((s) => DATE_TOKEN.test(s));
      const descItems = line.items.filter((i) => i.x >= columns.descMinX && (i.x < columns.amountMinX || !NUMBER_TOKEN.test(i.str.trim())));
      const description = descItems.map((i) => i.str.trim()).join(" ").replace(/\s+/g, " ").trim();
      const numeric = line.items.filter((i) => i.x >= columns.amountMinX && NUMBER_TOKEN.test(i.str.trim()));
      const debit = amountCents(numeric.filter((i) => i.x < columns.creditMinX));
      const credit = amountCents(numeric.filter((i) => i.x >= columns.creditMinX && i.x < columns.balanceMinX));
      const balance = amountCents(numeric.filter((i) => i.x >= columns.balanceMinX));

      if (/^SALDO INICIAL\b/.test(description)) {
        opening = balance;
        continue;
      }
      if (/^TRANSPORTE\b/.test(description)) {
        if (carried !== null && balance !== null && balance !== carried) {
          issues.push({ code: "carry_mismatch", message: `Transporte de página (${balance / 100}) diferente do saldo a transportar (${carried / 100}).`, blocking: false });
        }
        continue;
      }
      if (/^A TRANSPORTAR\b/.test(description)) {
        carried = balance;
        break; // resto da página é rodapé
      }
      if (/^SALDO FINAL\b/.test(description)) {
        closing = balance;
        done = true;
        break;
      }

      if (dates.length === 0) {
        // Continuação da descrição do movimento anterior (descritivo longo partido em duas linhas).
        const last = movements[movements.length - 1];
        if (last && description && numeric.length === 0) last.description = `${last.description} ${description}`;
        continue;
      }

      const amount = debit ?? credit;
      if (amount === null || balance === null || (debit !== null && credit !== null)) {
        issues.push({ code: "movement_without_amount", message: `Movimento sem valor legível: «${description || line.text}».`, blocking: true });
        continue;
      }
      const bookingDate = resolveDate(dates[0]!, meta.periodStart, meta.periodEnd);
      const valueDate = resolveDate(dates[1] ?? dates[0]!, meta.periodStart, meta.periodEnd);
      if (!bookingDate || !valueDate) {
        issues.push({ code: "missing_period", message: `Data ilegível no movimento «${description}».`, blocking: true });
        continue;
      }
      movements.push({
        bookingDate,
        valueDate,
        description: description || "(sem descritivo)",
        amount: Math.abs(amount),
        balanceAfter: balance,
        movementType: debit !== null ? "debit" : "credit",
      });
    }
  }

  // Validação pela cadeia de saldos: cada saldo = anterior ± valor; o último = saldo final.
  if (meta.accountNumber === null && meta.iban === null) issues.push({ code: "missing_account", message: "Não foi possível ler o número de conta nem o IBAN.", blocking: true });
  if (meta.periodStart === null) issues.push({ code: "missing_period", message: "Não foi possível ler o período do extrato.", blocking: true });
  if (opening === null) issues.push({ code: "missing_opening", message: "Não foi encontrado o SALDO INICIAL.", blocking: true });
  if (closing === null) issues.push({ code: "missing_closing", message: "Não foi encontrado o SALDO FINAL.", blocking: true });
  if (opening !== null) {
    let running = opening;
    let breaks = 0;
    for (const m of movements) {
      running += m.movementType === "credit" ? m.amount : -m.amount;
      if (running !== m.balanceAfter) {
        breaks++;
        if (breaks <= 3) {
          issues.push({
            code: "balance_chain_break",
            message: `O saldo não bate em ${m.bookingDate.toISOString().slice(0, 10)} «${m.description}»: esperado ${(running / 100).toFixed(2)}, extrato ${(m.balanceAfter / 100).toFixed(2)}.`,
            blocking: true,
          });
        }
        running = m.balanceAfter;
      }
    }
    if (closing !== null && running !== closing) {
      issues.push({ code: "closing_mismatch", message: `Os movimentos terminam em ${(running / 100).toFixed(2)} mas o SALDO FINAL é ${(closing / 100).toFixed(2)}.`, blocking: true });
    }
  }

  return {
    template: "millennium_pdf",
    bankName: "Millennium BCP",
    accountNumber: meta.accountNumber,
    iban: meta.iban,
    nib: meta.nib,
    currency: meta.currency,
    accountLabel: meta.accountLabel,
    statementNumber: meta.statementNumber,
    periodStart: meta.periodStart,
    periodEnd: meta.periodEnd,
    openingBalance: opening,
    closingBalance: closing,
    movements,
    issues,
  };
}
