import type { SupplierStatus, UpdateSupplierData } from "../../entities/supplier.js";

// ---- Shared DTO ----
export interface SupplierDTO {
  id: string;
  name: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  iban: string | null;
  defaultCostCenterId: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
  status: SupplierStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Create ----
export interface CreateSupplierCommand {
  name: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  iban?: string | null;
  defaultCostCenterId?: string | null;
  paymentTermsDays?: number | null;
  notes?: string | null;
}

export interface CreateSupplierPort {
  execute(command: CreateSupplierCommand): Promise<SupplierDTO>;
}

// ---- Update ----
export interface UpdateSupplierCommand {
  id: string;
  data: UpdateSupplierData;
}

export interface UpdateSupplierPort {
  execute(command: UpdateSupplierCommand): Promise<SupplierDTO>;
}

// ---- Toggle status ----
export interface ToggleSupplierStatusCommand {
  id: string;
  status: "active" | "inactive";
}

export interface ToggleSupplierStatusPort {
  execute(command: ToggleSupplierStatusCommand): Promise<SupplierDTO>;
}

// ---- List ----
export interface ListSuppliersCommand {
  status?: "active" | "inactive";
  search?: string;
}

export interface ListSuppliersPort {
  execute(command?: ListSuppliersCommand): Promise<SupplierDTO[]>;
}

// ---- Get ----
export interface GetSupplierCommand {
  id: string;
}

export interface GetSupplierPort {
  execute(command: GetSupplierCommand): Promise<SupplierDTO>;
}
