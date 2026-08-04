import type { GetSummaryPort, SummaryParams, VendusSummaryResult } from "../../domain/ports/in/get-summary.port.js";
import type { VendusGatewayPort } from "../../domain/ports/out/vendus-gateway.port.js";
import type { VendusProductCatalogPort } from "../../domain/ports/out/vendus-product-catalog.port.js";
import type { VendusDetailedDocument } from "../../domain/entities/vendus-document.js";
import { detectChannel } from "../../domain/services/channel-detector.service.js";
import { computeVendusAnalytics } from "../../domain/services/analytics-calculator.service.js";
import { mapLimit } from "../../../../utils/mapLimit.js";

export class GetSummaryUseCase implements GetSummaryPort {
  constructor(
    private readonly gateway: VendusGatewayPort,
    private readonly productCatalog: VendusProductCatalogPort,
    private readonly eatzPaymentId: number,
    private readonly concurrency: number,
  ) {}

  async execute(params: SummaryParams): Promise<VendusSummaryResult> {
    const { since, until } = params;

    // 1. Fetch list docs + product catalog in parallel
    const [listDocs, catalog] = await Promise.all([
      this.gateway.listDocuments({ since, until, type: "FS,FT,NC", per_page: 500 }),
      this.productCatalog.getProducts(),
    ]);

    const ncDocs = listDocs.filter((d) => d.type === "NC");
    const fsDocs = listDocs.filter((d) => d.type === "FS" || d.type === "FT");

    // 2. Fetch details for all NC docs first (to find which FS numbers they cancel)
    const ncDetails = await mapLimit(ncDocs, this.concurrency, (d) =>
      this.gateway.fetchDetail(d.id),
    );

    // 3. Build set of cancelled FS/FT document numbers
    const cancelledNumbers = new Set<string>();
    for (const nc of ncDetails) {
      for (const rel of nc.related_docs ?? []) {
        if (rel.type === "FS" || rel.type === "FT") {
          cancelledNumbers.add(rel.number);
        }
      }
    }

    // 4. Fetch details for ALL FS/FT (cancelled and non-cancelled)
    const fsDetails = await mapLimit(fsDocs, this.concurrency, (d) =>
      this.gateway.fetchDetail(d.id),
    );

    // 5. Enrich all docs with channel
    const fsEnriched = fsDetails.map((raw) => ({ ...raw, channel: detectChannel(raw, this.eatzPaymentId) }));
    const ncEnriched = ncDetails.map((raw) => ({ ...raw, channel: detectChannel(raw, this.eatzPaymentId) }));

    // All documents for UI (cancelled FS included so they are visible and linkable)
    const documents: VendusDetailedDocument[] = [...fsEnriched, ...ncEnriched]
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    // Analytics: only exclude FS/NC pairs where BOTH are in the same period.
    // A NC that cancels a FS from a different period is a real deduction and must be included.
    const fsNumbersInPeriod = new Set(fsEnriched.map((d) => d.number));
    const samePeriodCancelledNumbers = new Set(
      [...cancelledNumbers].filter((n) => fsNumbersInPeriod.has(n)),
    );
    const samePeriodCancelledNcIds = new Set<number>(
      ncDetails
        .filter((nc) =>
          (nc.related_docs ?? []).some(
            (r) =>
              (r.type === "FS" || r.type === "FT") &&
              samePeriodCancelledNumbers.has(r.number),
          ),
        )
        .map((nc) => nc.id),
    );
    const docsForAnalytics = [
      ...fsEnriched.filter((d) => !samePeriodCancelledNumbers.has(d.number)),
      ...ncEnriched.filter((d) => !samePeriodCancelledNcIds.has(d.id)),
    ];

    // 6. Compute analytics
    const analytics = computeVendusAnalytics(
      docsForAnalytics,
      catalog,
      new Date(since),
      new Date(until),
    );

    return { documents, analytics };
  }
}
