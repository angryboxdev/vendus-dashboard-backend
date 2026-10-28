import { sumLines } from "../entities/platform-statement.js";
import type { PlatformStatementSummary } from "../ports/in/list-platform-statements.port.js";
import type { StoredPlatformStatement } from "../ports/out/platform-statement-repository.port.js";

/** Totais de um extrato por natureza (com IVA), para a lista e, mais tarde, para a DRE. */
export function summarizeStatement(s: StoredPlatformStatement): PlatformStatementSummary {
  const fees = s.lines.filter((l) => l.kind === "commission" || l.kind === "marketing" || l.kind === "other_fee");
  return {
    id: s.id,
    platform: s.platform,
    documentKind: s.documentKind,
    documentNumber: s.documentNumber,
    periodFrom: s.periodFrom,
    periodTo: s.periodTo,
    issuedOn: s.issuedOn,
    ordersCount: s.ordersCount,
    salesCents: sumLines(s, "sales"),
    salesVatCents: sumLines(s, "sales", "vatCents"),
    promotionsCents: sumLines(s, "promotion"),
    commissionCents: sumLines(s, "commission"),
    marketingCents: sumLines(s, "marketing"),
    otherFeesCents: sumLines(s, "other_fee"),
    refundsCents: sumLines(s, "refund"),
    cashCents: sumLines(s, "cash"),
    adjustmentsCents: sumLines(s, "adjustment"),
    feesVatCents: fees.reduce((a, l) => a + l.vatCents, 0),
    netPayoutCents: s.netPayoutCents,
    fileName: s.fileName,
    importedAt: s.importedAt,
  };
}
