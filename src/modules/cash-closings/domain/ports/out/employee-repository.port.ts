export interface Employee {
  id: string;
  fullName: string;
}

export interface EmployeeRepositoryPort {
  /** Procura um funcionário activo pelo hash do PIN. */
  findActiveByPinHash(pinHash: string): Promise<Employee | null>;
  /** Procura um funcionário activo pelo ID. */
  findActiveById(id: string): Promise<Employee | null>;
}
