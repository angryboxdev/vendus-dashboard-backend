import type { CostCenter } from "../../domain/entities/cost-center.js";
import type { Supplier } from "../../domain/entities/supplier.js";
import type { CostCenterDTO } from "../../domain/ports/in/cost-center.ports.js";
import type { SupplierDTO } from "../../domain/ports/in/supplier.ports.js";

export function toCostCenterDTO(cc: CostCenter): CostCenterDTO {
  return {
    id: cc.id,
    code: cc.code,
    name: cc.name,
    category: cc.category,
    subcategory: cc.subcategory,
    description: cc.description,
    responsibleName: cc.responsibleName,
    status: cc.status,
    createdAt: cc.createdAt,
    updatedAt: cc.updatedAt,
  };
}

export function toSupplierDTO(s: Supplier): SupplierDTO {
  return {
    id: s.id,
    name: s.name,
    nif: s.nif,
    email: s.email,
    phone: s.phone,
    address: s.address,
    iban: s.iban,
    defaultCostCenterId: s.defaultCostCenterId,
    paymentTermsDays: s.paymentTermsDays,
    notes: s.notes,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
