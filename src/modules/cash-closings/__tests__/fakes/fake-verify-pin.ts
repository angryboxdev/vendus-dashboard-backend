import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvalidPinError } from "../../domain/errors.js";
import type { VerifyPinCommand, VerifyPinPort, VerifyPinResult } from "../../domain/ports/in/verify-pin.port.js";

function key(organizationId: OrganizationId, pin: string): string {
  return `${organizationId}:${pin}`;
}

export class FakeVerifyPinPort implements VerifyPinPort {
  private readonly byOrgPin = new Map<string, VerifyPinResult>();
  callCount = 0;

  addEmployeePin(organizationId: OrganizationId, pin: string, result: VerifyPinResult): void {
    this.byOrgPin.set(key(organizationId, pin), result);
  }

  async execute(command: VerifyPinCommand): Promise<VerifyPinResult> {
    this.callCount++;
    const result = this.byOrgPin.get(key(command.organizationId, command.pin));
    if (!result) throw new InvalidPinError();
    return result;
  }
}
