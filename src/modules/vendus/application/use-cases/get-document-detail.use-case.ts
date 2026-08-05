import type { GetDocumentDetailPort, GetDocumentDetailResult } from "../../domain/ports/in/get-document-detail.port.js";
import type { VendusGatewayPort } from "../../domain/ports/out/vendus-gateway.port.js";
import type { VendusProductCatalogPort } from "../../domain/ports/out/vendus-product-catalog.port.js";
import { detectChannel } from "../../domain/services/channel-detector.service.js";
import { detectCategory } from "../../domain/services/category-detector.service.js";

const DRINK_CATEGORIES = new Set(["bebida_alcoolica", "bebida_nao_alcoolica"]);

export class GetDocumentDetailUseCase implements GetDocumentDetailPort {
  constructor(
    private readonly gateway: VendusGatewayPort,
    private readonly productCatalog: VendusProductCatalogPort,
    private readonly eatzPaymentId: number,
    private readonly appsPaymentId: number,
  ) {}

  async execute(id: number): Promise<GetDocumentDetailResult> {
    const [raw, catalog] = await Promise.all([
      this.gateway.fetchDetail(id),
      this.productCatalog.getProducts(),
    ]);

    const channel = detectChannel(raw, this.eatzPaymentId, this.appsPaymentId);
    const has_drinks = raw.items.some((item) => {
      const cat = detectCategory({ reference: item.reference, title: item.title }, catalog);
      return DRINK_CATEGORIES.has(cat);
    });

    return { ...raw, channel, has_drinks };
  }
}
