import type { AccountingSettingsRepositoryPort, AccountingSettingsDTO } from "../../domain/ports/out/accounting-settings-repository.port.js";
import type { GetAccountingSettingsCommand, GetAccountingSettingsPort } from "../../domain/ports/in/accounting-settings.ports.js";

export class GetAccountingSettingsUseCase implements GetAccountingSettingsPort {
  constructor(private readonly repository: AccountingSettingsRepositoryPort) {}

  async execute(command: GetAccountingSettingsCommand): Promise<AccountingSettingsDTO> {
    return this.repository.get(command.organizationId);
  }
}
