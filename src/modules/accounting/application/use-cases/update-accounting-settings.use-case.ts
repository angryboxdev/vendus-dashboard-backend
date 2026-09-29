import { InvalidVatPeriodicityError } from "../../domain/errors.js";
import type { AccountingSettingsRepositoryPort, AccountingSettingsDTO } from "../../domain/ports/out/accounting-settings-repository.port.js";
import type { VatPeriodicity } from "../../domain/services/vat-period.service.js";
import type { UpdateAccountingSettingsCommand, UpdateAccountingSettingsPort } from "../../domain/ports/in/accounting-settings.ports.js";

const VALID_PERIODICITIES: VatPeriodicity[] = ["monthly", "quarterly"];

export class UpdateAccountingSettingsUseCase implements UpdateAccountingSettingsPort {
  constructor(private readonly repository: AccountingSettingsRepositoryPort) {}

  async execute(command: UpdateAccountingSettingsCommand): Promise<AccountingSettingsDTO> {
    if (!VALID_PERIODICITIES.includes(command.vatPeriodicity as VatPeriodicity)) {
      throw new InvalidVatPeriodicityError(command.vatPeriodicity);
    }
    const settings: AccountingSettingsDTO = { vatPeriodicity: command.vatPeriodicity as VatPeriodicity };
    await this.repository.save(command.organizationId, settings);
    return settings;
  }
}
