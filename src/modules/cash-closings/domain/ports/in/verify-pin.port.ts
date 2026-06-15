export interface VerifyPinCommand {
  pin: string;
}

export interface VerifyPinResult {
  employeeId: string;
  fullName: string;
}

export interface VerifyPinPort {
  execute(command: VerifyPinCommand): Promise<VerifyPinResult>;
}
