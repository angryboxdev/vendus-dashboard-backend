import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvoiceNotFoundError, InvoiceVersionConflictError } from "../../domain/errors.js";
import type { AllocationCommand, InvoiceDTO } from "../../domain/ports/in/invoice.ports.js";
import type { CostCenterCategoryReaderPort } from "../../domain/ports/out/cost-center-category-reader.port.js";
import type { InvoiceAllocationRepositoryPort } from "../../domain/ports/out/invoice-allocation-repository.port.js";
import type { InvoiceAuditPort } from "../../domain/ports/out/invoice-audit.port.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import { auditSnapshot } from "./shared-audit.js";
import { buildAllocations } from "./shared-financial-mode.js";
import { toInvoiceDTO } from "./shared.js";

/**
 * Repartição «Por valores» de uma fatura já lançada (F2 v1.2 §2.2): a soma
 * tem de igualar a base líquida ao cêntimo; passa a fatura para «Por valores»
 * (as linhas reais ficam como estão). Auditado.
 */
export class ReplaceInvoiceAllocationsUseCase {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly categoryReader: CostCenterCategoryReaderPort,
    private readonly allocationRepo: InvoiceAllocationRepositoryPort,
    private readonly audit: InvoiceAuditPort,
  ) {}

  async execute(command: { organizationId: OrganizationId; id: string; allocations: AllocationCommand[]; expectedVersion?: number; actor?: string; reason?: string }): Promise<InvoiceDTO> {
    const existing = await this.invoiceRepo.findById(command.organizationId, command.id);
    if (!existing) throw new InvoiceNotFoundError(command.id);
    if (command.expectedVersion !== undefined && command.expectedVersion !== existing.version) {
      throw new InvoiceVersionConflictError(existing.id, existing.version);
    }
    const { allocations } = await buildAllocations(this.categoryReader, command.organizationId, existing.id, command.allocations, Math.abs(existing.subtotalWithoutVat), true);
    const version = await this.invoiceRepo.claimVersion(command.organizationId, existing.id, command.expectedVersion ?? existing.version);
    if (version === null) throw new InvoiceVersionConflictError(existing.id, null);
    const updated = existing.update({ costCenterGroupId: null, costCenterCategoryId: null }).setLineDetailMode("by_values").withVersion(version);
    await this.invoiceRepo.update(command.organizationId, updated);
    await this.allocationRepo.replaceForInvoice(command.organizationId, existing.id, allocations);
    await this.audit.record(command.organizationId, {
      invoiceId: existing.id,
      action: "update",
      actor: command.actor ?? "sistema",
      origin: "manual",
      reason: command.reason?.trim() || "Repartição «Por valores»",
      before: auditSnapshot(existing),
      after: { ...auditSnapshot(updated), allocations: allocations.map((a) => ({ category: a.costCenterCategoryId, location: a.locationId, netCents: a.netCents })) },
    });
    return toInvoiceDTO(updated, undefined, undefined, false, allocations);
  }
}
