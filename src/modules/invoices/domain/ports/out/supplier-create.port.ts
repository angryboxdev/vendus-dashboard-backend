import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface NewSupplierData {
  name: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  iban?: string | null;
  defaultCostCenterGroupId?: string | null;
  defaultCostCenterCategoryId?: string | null;
  paymentTermsDays?: number | null;
}

export interface CreatedSupplierRef {
  id: string;
  name: string;
}

export interface SupplierCreatePort {
  create(organizationId: OrganizationId, data: NewSupplierData): Promise<CreatedSupplierRef>;
}
