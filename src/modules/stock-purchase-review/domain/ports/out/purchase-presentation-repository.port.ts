import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PurchasePresentation } from "../../entities/purchase-presentation.js";

/** Apresentações de compra (`supplier_purchase_presentations`); só as ativas, salvo o histórico. */
export interface PurchasePresentationRepositoryPort {
  findActive(organizationId: OrganizationId, supplierId: string, matchKey: string): Promise<PurchasePresentation | null>;
  listActiveBySupplier(organizationId: OrganizationId, supplierId: string): Promise<PurchasePresentation[]>;
  /** Versões anteriores e a atual, da mais recente para a mais antiga. */
  history(organizationId: OrganizationId, supplierId: string, matchKey: string): Promise<PurchasePresentation[]>;
  /** Fecha a versão ativa (se houver) e grava a nova — nunca reescreve a anterior. */
  /** Fecha a versão ativa sem a substituir (a linha deixou de ser artigo de stock). */
  supersede(organizationId: OrganizationId, presentation: PurchasePresentation): Promise<void>;
  replaceActive(organizationId: OrganizationId, matchKey: string, next: PurchasePresentation, previous: PurchasePresentation | null): Promise<void>;
}
