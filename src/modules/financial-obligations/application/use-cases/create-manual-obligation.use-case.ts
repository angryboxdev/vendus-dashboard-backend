import { FinancialObligation } from "../../domain/entities/financial-obligation.js";
import type { FinancialObligationRepositoryPort } from "../../domain/ports/out/obligation-repository.port.js";
import type {
  CreateManualObligationPort,
  CreateManualObligationCommand,
  FinancialObligationDTO,
} from "../../domain/ports/in/obligation.ports.js";
import { toDTO } from "./shared.js";

export class CreateManualObligationUseCase implements CreateManualObligationPort {
  constructor(private readonly repo: FinancialObligationRepositoryPort) {}

  async execute(command: CreateManualObligationCommand): Promise<FinancialObligationDTO> {
    const obligation = FinancialObligation.create({
      source: "manual",
      supplierId: command.supplierId ?? null,
      supplierName: command.supplierName,
      description: command.description,
      amountCents: command.amountCents,
      dueDate: new Date(command.dueDate),
      paymentMethod: command.paymentMethod ?? null,
      costCenterId: command.costCenterId ?? null,
    });

    await this.repo.save(obligation);
    return toDTO(obligation);
  }
}
