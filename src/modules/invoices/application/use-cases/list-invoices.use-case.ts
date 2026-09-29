import type {
  ListInvoicesPort,
  ListInvoicesFilter,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort, InvoiceFilter } from "../../domain/ports/out/invoice-repository.port.js";
import type { CostCenterCategoryReaderPort, CategoryLookup } from "../../domain/ports/out/cost-center-category-reader.port.js";
import { findDuplicateInvoiceIds } from "../../domain/utils/duplicate-detection.js";
import { toInvoiceDTO } from "./shared.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export class ListInvoicesUseCase implements ListInvoicesPort {
  constructor(
    private readonly invoiceRepo: InvoiceRepositoryPort,
    private readonly categoryReader: CostCenterCategoryReaderPort,
  ) {}

  async execute(organizationId: OrganizationId, filter?: ListInvoicesFilter): Promise<InvoiceDTO[]> {
    // "overdue" nunca fica persistido no status guardado — nada no sistema
    // transita uma fatura para este estado automaticamente (mesmo cálculo já
    // usado em GetInvoiceAlertsUseCase: não paga/cancelada/rascunho E com
    // vencimento já passado). Reenviar "overdue" como igualdade literal ao
    // repositório devolveria sempre lista vazia — por isso é sempre um
    // filtro derivado, aplicado em memória depois de carregar os restantes.
    const isOverdueFilter = filter?.status === "overdue";

    const repoFilter: InvoiceFilter = {};
    if (filter?.supplierId) repoFilter.supplierId = filter.supplierId;
    if (filter?.costCenterId) repoFilter.costCenterId = filter.costCenterId;
    if (filter?.status && !isOverdueFilter) repoFilter.status = filter.status;
    if (filter?.reconciliationStatus) repoFilter.reconciliationStatus = filter.reconciliationStatus;
    if (filter?.from) repoFilter.from = new Date(filter.from);
    if (filter?.to) repoFilter.to = new Date(filter.to);
    if (filter?.search) repoFilter.search = filter.search;
    if (filter?.documentType) repoFilter.documentType = filter.documentType;

    let invoices = await this.invoiceRepo.findAll(organizationId, repoFilter);
    if (isOverdueFilter) {
      const today = startOfDay(new Date());
      invoices = invoices.filter(
        (inv) =>
          inv.status !== "paid" &&
          inv.status !== "cancelled" &&
          inv.status !== "draft_ai" &&
          inv.dueDate != null &&
          startOfDay(inv.dueDate) < today,
      );
    }

    const categoryIds = [...new Set(
      invoices.map((inv) => inv.costCenterCategoryId).filter((id): id is string => id != null),
    )];
    const lookups: CategoryLookup[] = categoryIds.length > 0
      ? await this.categoryReader.findManyByIds(organizationId, categoryIds)
      : [];
    const categoryMap = new Map(lookups.map((l) => [l.id, l]));

    // Calculado sobre a própria lista devolvida (não persistido) — ver
    // findDuplicateInvoiceIds. Quando a listagem é filtrada (ex: por status),
    // só deteta duplicados dentro do subconjunto filtrado.
    const duplicateIds = findDuplicateInvoiceIds(invoices);

    return invoices.map((inv) => toInvoiceDTO(inv, undefined, categoryMap, duplicateIds.has(inv.id)));
  }
}
