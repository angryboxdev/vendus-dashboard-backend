import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PurchasePresentation } from "../../domain/entities/purchase-presentation.js";
import type { PurchasePresentationRepositoryPort } from "../../domain/ports/out/purchase-presentation-repository.port.js";

export class FakePurchasePresentationRepository implements PurchasePresentationRepositoryPort {
  rows: { matchKey: string; p: PurchasePresentation }[] = [];

  async findActive(_o: OrganizationId, supplierId: string, matchKey: string) {
    return this.rows.find((r) => r.matchKey === matchKey && r.p.toProps().supplierId === supplierId && !r.p.toProps().supersededAt)?.p ?? null;
  }
  async listActiveBySupplier(_o: OrganizationId, supplierId: string | null) {
    return this.rows.filter((r) => (supplierId === null || r.p.toProps().supplierId === supplierId) && !r.p.toProps().supersededAt).map((r) => r.p);
  }
  async history(_o: OrganizationId, supplierId: string, matchKey: string) {
    return this.rows.filter((r) => r.matchKey === matchKey && r.p.toProps().supplierId === supplierId).map((r) => r.p).reverse();
  }
  async supersede(_o: OrganizationId, presentation: PurchasePresentation) {
    this.rows = this.rows.map((r) => (r.p.id === presentation.id ? { ...r, p: r.p.supersede() } : r));
  }
  async replaceActive(_o: OrganizationId, matchKey: string, next: PurchasePresentation, previous: PurchasePresentation | null) {
    if (previous) this.rows = this.rows.map((r) => (r.p.id === previous.id ? { ...r, p: r.p.supersede() } : r));
    this.rows.push({ matchKey, p: next });
  }
}
