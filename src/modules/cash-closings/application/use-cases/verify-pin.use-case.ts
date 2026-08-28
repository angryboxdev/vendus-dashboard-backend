import { InvalidPinError } from "../../domain/errors.js";
import type { VerifyPinPort, VerifyPinCommand, VerifyPinResult } from "../../domain/ports/in/verify-pin.port.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";

export class VerifyPinUseCase implements VerifyPinPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly hashPin: (pin: string) => string,
  ) {}

  async execute(command: VerifyPinCommand): Promise<VerifyPinResult> {
    const pinHash = this.hashPin(command.pin);
    const employee = await this.employeeRepository.findActiveByPinHash(
      command.organizationId,
      pinHash,
    );
    if (!employee) throw new InvalidPinError();
    return { employeeId: employee.id, fullName: employee.fullName };
  }
}
