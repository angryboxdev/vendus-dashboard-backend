import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { Employee, type EmploymentType, type EmployeeStatus, type JobRole, type SalaryType } from "../../domain/entities/employee.js";
import type { EmployeeFilter, EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";

const SELECT =
  "id, full_name, email, phone, role_or_notes, employment_type, job_role, status, hired_at, ended_at, base_salary, salary_type, hourly_rate, nif, iban, address, birth_date, social_security_number, id_card_number, nationality, emergency_contact_name, emergency_contact_phone, photo_storage_path, created_at, updated_at";

/** Limite alto usado como "praticamente todos" — mesma abordagem já usada pela listagem legacy (ver README). */
const FIND_MANY_LIMIT = 500;

interface Row {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_or_notes: string | null;
  employment_type: string;
  job_role: string;
  status: string;
  hired_at: string | null;
  ended_at: string | null;
  base_salary: string | number | null;
  salary_type: string;
  hourly_rate: string | number | null;
  nif: string | null;
  iban: string | null;
  address: string | null;
  birth_date: string | null;
  social_security_number: string | null;
  id_card_number: string | null;
  nationality: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  photo_storage_path: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEmployee(row: Row): Employee {
  const employmentType = row.employment_type as EmploymentType;
  const jobRole = row.job_role as JobRole;
  return Employee.reconstitute({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    roleOrNotes: row.role_or_notes,
    employmentType: ["permanent", "contract", "extra"].includes(employmentType) ? employmentType : "permanent",
    jobRole: ["manager", "prep", "service"].includes(jobRole) ? jobRole : "service",
    status: row.status as EmployeeStatus,
    hiredAt: row.hired_at,
    endedAt: row.ended_at,
    baseSalary: row.base_salary != null ? Number(row.base_salary) : null,
    salaryType: row.salary_type === "hourly" ? "hourly" : ("fixed" as SalaryType),
    hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
    nif: row.nif,
    iban: row.iban,
    address: row.address,
    birthDate: row.birth_date,
    socialSecurityNumber: row.social_security_number,
    idCardNumber: row.id_card_number,
    nationality: row.nationality,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    photoStoragePath: row.photo_storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function employeeToInsert(employee: Employee): Record<string, unknown> {
  const p = employee.toProps();
  return {
    id: p.id,
    full_name: p.fullName,
    email: p.email,
    phone: p.phone,
    role_or_notes: p.roleOrNotes,
    employment_type: p.employmentType,
    job_role: p.jobRole,
    status: p.status,
    hired_at: p.hiredAt,
    ended_at: p.endedAt,
    base_salary: p.baseSalary,
    salary_type: p.salaryType,
    hourly_rate: p.hourlyRate,
    nif: p.nif,
    iban: p.iban,
    address: p.address,
    birth_date: p.birthDate,
    social_security_number: p.socialSecurityNumber,
    id_card_number: p.idCardNumber,
    nationality: p.nationality,
    emergency_contact_name: p.emergencyContactName,
    emergency_contact_phone: p.emergencyContactPhone,
    photo_storage_path: p.photoStoragePath,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export class SupabaseEmployeeRepository implements EmployeeRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, id: string): Promise<Employee | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employees")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToEmployee(data as unknown as Row);
  }

  async findMany(organizationId: OrganizationId, filter: EmployeeFilter): Promise<Employee[]> {
    let q = this.scopedQuery(organizationId)
      .table("hr_employees")
      .select(SELECT)
      .order("full_name", { ascending: true })
      .range(0, FIND_MANY_LIMIT - 1);

    if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
    if (filter.employmentType) q = q.eq("employment_type", filter.employmentType);
    if (filter.search) q = q.or(`full_name.ilike.%${filter.search}%,email.ilike.%${filter.search}%`);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(rowToEmployee);
  }

  async create(organizationId: OrganizationId, employee: Employee): Promise<Employee> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employees")
      .insert(employeeToInsert(employee))
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToEmployee(data as unknown as Row);
  }

  async update(organizationId: OrganizationId, employee: Employee): Promise<Employee> {
    const { id, ...patch } = employeeToInsert(employee);
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employees")
      .update(patch)
      .eq("id", id as string)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToEmployee(data as unknown as Row);
  }
}
