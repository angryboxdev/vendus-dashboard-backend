import type { VendusProductCatalogPort } from "../../domain/ports/out/vendus-product-catalog.port.js";
import type { VendusProduct } from "../../domain/entities/vendus-product.js";

export class FakeProductCatalog implements VendusProductCatalogPort {
  private products: Map<string, VendusProduct>;

  constructor(products: VendusProduct[] = []) {
    this.products = new Map();
    for (const p of products) {
      if (p.reference) this.products.set(p.reference.toLowerCase(), p);
      this.products.set(`title:${p.title.toLowerCase()}`, p);
    }
  }

  async getProducts(): Promise<Map<string, VendusProduct>> {
    return new Map(this.products);
  }
}
