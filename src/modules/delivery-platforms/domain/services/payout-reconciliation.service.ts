import type {
  ExpectedPayout,
  PayoutReconciliation,
  PayoutStatus,
  PlatformBankCredit,
  PlatformPayoutTotals,
} from "../entities/payout-reconciliation.js";
import type { DeliveryPlatform } from "../entities/platform-statement.js";
import type { StoredPlatformStatement } from "../ports/out/platform-statement-repository.port.js";

type Platform = Exclude<DeliveryPlatform, "airmenu">;
const PLATFORMS: Platform[] = ["uber_eats", "glovo", "bolt_food"];
const NAMES: Record<Platform, string> = { uber_eats: "Uber Eats", glovo: "Glovo", bolt_food: "Bolt Food" };

/** Dias, depois do fim do período, em que o crédito pode chegar (a Glovo emite o extrato e paga dias depois). */
export const PAYOUT_WINDOW_DAYS = 21;
/** Diferença aceite como «o mesmo valor» (arredondamentos). */
const EXACT_CENTS = 2;
/** Diferença máxima (fração do esperado, mínimo 5 €) para ligar um crédito com outro valor. */
const PLAUSIBLE_SHARE = 0.25;

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const dayDistance = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

type Draft = Pick<ExpectedPayout, "platform" | "periodFrom" | "periodTo" | "paidOn" | "expectedCents">;

/**
 * Transferências esperadas: as que os documentos indicam (semanas da Uber, quinzenas da Glovo) e, na
 * Bolt, vendas da semana (relatório de pedidos, sem as pagas em dinheiro) − total da fatura semanal.
 * O mesmo pagamento em dois documentos conta uma vez.
 */
function expectedPayouts(statements: StoredPlatformStatement[]): { drafts: Draft[]; warnings: string[] } {
  const drafts = new Map<string, Draft>();
  const warnings: string[] = [];
  for (const s of statements) {
    if (s.platform === "airmenu" || s.platform === "bolt_food") continue;
    for (const p of s.payouts) {
      const d: Draft = { platform: s.platform, periodFrom: p.periodFrom, periodTo: p.periodTo, paidOn: p.paidOn, expectedCents: p.netCents };
      drafts.set(`${d.platform}|${d.periodFrom}|${d.periodTo}|${d.expectedCents}`, d);
    }
  }
  const boltOrders = statements.filter((s) => s.documentKind === "bolt_orders_report");
  for (const invoice of statements.filter((s) => s.documentKind === "bolt_weekly_invoice")) {
    const days = (l: { date?: string }) => !!l.date && l.date >= invoice.periodFrom && l.date <= invoice.periodTo;
    const covered = boltOrders.some((o) => o.periodFrom <= invoice.periodTo && o.periodTo >= invoice.periodFrom);
    if (!covered) {
      warnings.push(`Bolt Food ${invoice.documentNumber}: falta o relatório de pedidos dessa semana — transferência não calculada.`);
      continue;
    }
    const lines = boltOrders.flatMap((o) => o.lines).filter(days);
    const sales = lines.filter((l) => l.kind === "sales").reduce((a, l) => a + l.grossCents, 0);
    const cash = lines.filter((l) => l.kind === "cash").reduce((a, l) => a + l.grossCents, 0);
    const d: Draft = { platform: "bolt_food", periodFrom: invoice.periodFrom, periodTo: invoice.periodTo, paidOn: null, expectedCents: sales - cash + invoice.netPayoutCents };
    drafts.set(`bolt_food|${d.periodFrom}|${d.periodTo}|${invoice.documentNumber}`, d);
  }
  return { drafts: [...drafts.values()], warnings };
}

/**
 * Conferência das transferências das vendas de um mês: cada transferência esperada cujo período
 * termina no mês liga-se ao crédito da mesma plataforma que entrou entre o fim do período e
 * `PAYOUT_WINDOW_DAYS` depois — o de valor mais próximo (e, empatado, o mais perto da data indicada).
 * Cada crédito liga-se uma vez. `statements` — documentos à volta do mês; `credits` — créditos das
 * plataformas desde o início do mês até depois da janela.
 */
export function buildPayoutReconciliation(
  year: number,
  month: number,
  statements: StoredPlatformStatement[],
  credits: PlatformBankCredit[],
  bankCoverageTo: string | null,
): PayoutReconciliation {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const { drafts, warnings } = expectedPayouts(statements);
  const inMonth = drafts
    .filter((d) => d.periodTo >= from && d.periodTo <= to)
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.periodTo.localeCompare(b.periodTo));

  const used = new Set<string>();
  const payouts: ExpectedPayout[] = inMonth.map((d) => {
    const dueBy = addDays(d.periodTo, PAYOUT_WINDOW_DAYS);
    const target = d.paidOn ?? d.periodTo;
    const tolerance = Math.max(500, Math.abs(d.expectedCents) * PLAUSIBLE_SHARE);
    const match = credits
      .filter((c) => c.platform === d.platform && !used.has(c.id) && c.date >= d.periodTo && c.date <= dueBy)
      .filter((c) => Math.abs(c.amountCents - d.expectedCents) <= tolerance)
      .sort((a, b) => Math.abs(a.amountCents - d.expectedCents) - Math.abs(b.amountCents - d.expectedCents) || dayDistance(a.date, target) - dayDistance(b.date, target))[0];
    if (match) used.add(match.id);
    const differenceCents = match ? match.amountCents - d.expectedCents : null;
    const status: PayoutStatus = match
      ? Math.abs(differenceCents!) <= EXACT_CENTS
        ? "ok"
        : "difference"
      : bankCoverageTo !== null && bankCoverageTo >= dueBy
        ? "missing"
        : "pending";
    return { ...d, dueBy, received: match ? { creditId: match.id, date: match.date, amountCents: match.amountCents } : null, differenceCents, status };
  });

  const totals: PlatformPayoutTotals[] = PLATFORMS.map((platform) => {
    const own = payouts.filter((p) => p.platform === platform);
    const received = own.filter((p) => p.received);
    return {
      platform,
      expectedCents: own.reduce((a, p) => a + p.expectedCents, 0),
      receivedCents: received.reduce((a, p) => a + p.received!.amountCents, 0),
      differenceCents: received.reduce((a, p) => a + (p.differenceCents ?? 0), 0),
      pendingCents: own.filter((p) => !p.received).reduce((a, p) => a + p.expectedCents, 0),
    };
  }).filter((t) => t.expectedCents !== 0 || t.receivedCents !== 0);

  const unmatchedCredits = credits.filter((c) => !used.has(c.id) && c.date >= from && c.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  for (const p of PLATFORMS) {
    if (!payouts.some((x) => x.platform === p) && unmatchedCredits.some((c) => c.platform === p)) {
      warnings.push(`${NAMES[p]}: há créditos no banco mas nenhum documento com a transferência do mês${p === "bolt_food" ? " (importe as faturas semanais e o relatório de pedidos)" : ""}.`);
    }
  }
  if (payouts.some((p) => p.status === "pending")) {
    warnings.push(
      bankCoverageTo === null
        ? "Sem movimentos do banco importados: as transferências aparecem como por receber."
        : `Banco importado só até ${bankCoverageTo}: as transferências devidas depois aparecem como por receber.`,
    );
  }
  return { period: { year, month, from, to }, bankCoverageTo, payouts, totals, unmatchedCredits, warnings };
}
