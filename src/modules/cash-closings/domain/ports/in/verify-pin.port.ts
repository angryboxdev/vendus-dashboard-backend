import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface VerifyPinCommand {
  /** Rota pública sem sessão (D14): fornecido pelo controller a partir do unattended scope. */
  organizationId: OrganizationId;
  pin: string;
}

export interface VerifyPinResult {
  employeeId: string;
  fullName: string;
}

export interface VerifyPinPort {
  execute(command: VerifyPinCommand): Promise<VerifyPinResult>;
}
