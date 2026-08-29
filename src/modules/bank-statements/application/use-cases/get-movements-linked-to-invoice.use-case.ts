import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankMovementEntityLinkRepositoryPort } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type {
  GetMovementsLinkedToInvoicePort,
  GetMovementsLinkedToInvoiceQuery,
  InvoiceLinkedMovement,
} from "../../domain/ports/in/bank-statement.ports.js";

export class GetMovementsLinkedToInvoiceUseCase implements GetMovementsLinkedToInvoicePort {
  constructor(
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
    private readonly movementRepo: BankMovementRepositoryPort,
  ) {}

  async execute(query: GetMovementsLinkedToInvoiceQuery): Promise<InvoiceLinkedMovement[]> {
    const { organizationId, invoiceId } = query;
    const links = await this.linkRepo.findByEntityIds(organizationId, "invoice", [invoiceId]);
    if (links.length === 0) return [];

    const movementIds = links.map((l) => l.movementId);
    const movements = await this.movementRepo.findByIds(organizationId, movementIds);
    const movementMap = new Map(movements.map((m) => [m.id, m]));

    return links.flatMap((l) => {
      const movement = movementMap.get(l.movementId);
      if (!movement) return [];
      return [{
        movementId: movement.id,
        bookingDate: movement.bookingDate.toISOString().slice(0, 10),
        description: movement.description,
        allocatedAmountCents: l.allocatedAmountCents,
        movementType: movement.movementType,
      }];
    });
  }
}
