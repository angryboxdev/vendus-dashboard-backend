import { InvalidEmployeeError } from "../errors.js";

export type EmployeeStatus = "active" | "inactive";
export type EmploymentType = "permanent" | "contract" | "extra";
export type JobRole = "manager" | "prep" | "service";
export type SalaryType = "fixed" | "hourly";

export interface EmployeeProps {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roleOrNotes: string | null;
  employmentType: EmploymentType;
  jobRole: JobRole;
  status: EmployeeStatus;
  hiredAt: string | null;
  endedAt: string | null;
  baseSalary: number | null;
  salaryType: SalaryType;
  hourlyRate: number | null;
  nif: string | null;
  iban: string | null;
  address: string | null;
  birthDate: string | null;
  socialSecurityNumber: string | null;
  idCardNumber: string | null;
  nationality: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoStoragePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateEmployeeData {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  roleOrNotes?: string | null;
  employmentType?: EmploymentType;
  jobRole?: JobRole;
  hiredAt?: string | null;
  endedAt?: string | null;
  baseSalary?: number | null;
  salaryType?: SalaryType;
  hourlyRate?: number | null;
  nif?: string | null;
  iban?: string | null;
  address?: string | null;
  birthDate?: string | null;
  socialSecurityNumber?: string | null;
  idCardNumber?: string | null;
  nationality?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

/**
 * Não inclui `weeklySchedule`/`hasKioskPin` (turnos/kiosk) nem pagamentos —
 * esses campos continuam a viver exclusivamente no domínio legacy
 * (`src/domain/hrTypes.ts`) durante a transição gradual (ver README).
 */
export class Employee {
  readonly id: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly roleOrNotes: string | null;
  readonly employmentType: EmploymentType;
  readonly jobRole: JobRole;
  readonly status: EmployeeStatus;
  readonly hiredAt: string | null;
  readonly endedAt: string | null;
  readonly baseSalary: number | null;
  readonly salaryType: SalaryType;
  readonly hourlyRate: number | null;
  readonly nif: string | null;
  readonly iban: string | null;
  readonly address: string | null;
  readonly birthDate: string | null;
  readonly socialSecurityNumber: string | null;
  readonly idCardNumber: string | null;
  readonly nationality: string | null;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  readonly photoStoragePath: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;

  private constructor(props: EmployeeProps) {
    this.id = props.id;
    this.fullName = props.fullName;
    this.email = props.email;
    this.phone = props.phone;
    this.roleOrNotes = props.roleOrNotes;
    this.employmentType = props.employmentType;
    this.jobRole = props.jobRole;
    this.status = props.status;
    this.hiredAt = props.hiredAt;
    this.endedAt = props.endedAt;
    this.baseSalary = props.baseSalary;
    this.salaryType = props.salaryType;
    this.hourlyRate = props.hourlyRate;
    this.nif = props.nif;
    this.iban = props.iban;
    this.address = props.address;
    this.birthDate = props.birthDate;
    this.socialSecurityNumber = props.socialSecurityNumber;
    this.idCardNumber = props.idCardNumber;
    this.nationality = props.nationality;
    this.emergencyContactName = props.emergencyContactName;
    this.emergencyContactPhone = props.emergencyContactPhone;
    this.photoStoragePath = props.photoStoragePath;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    roleOrNotes?: string | null;
    employmentType?: EmploymentType;
    jobRole?: JobRole;
    hiredAt?: string | null;
    baseSalary?: number | null;
    salaryType?: SalaryType;
    hourlyRate?: number | null;
    nif?: string | null;
    iban?: string | null;
    address?: string | null;
    birthDate?: string | null;
    socialSecurityNumber?: string | null;
    idCardNumber?: string | null;
    nationality?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
  }): Employee {
    if (!props.fullName || props.fullName.trim().length === 0) {
      throw new InvalidEmployeeError("fullName é obrigatório");
    }
    const now = new Date().toISOString();
    return new Employee({
      id: crypto.randomUUID(),
      fullName: props.fullName.trim(),
      email: props.email ?? null,
      phone: props.phone ?? null,
      roleOrNotes: props.roleOrNotes ?? null,
      employmentType: props.employmentType ?? "permanent",
      jobRole: props.jobRole ?? "service",
      status: "active",
      hiredAt: props.hiredAt ?? null,
      endedAt: null,
      baseSalary: props.baseSalary ?? null,
      salaryType: props.salaryType ?? "fixed",
      hourlyRate: props.hourlyRate ?? null,
      nif: props.nif ?? null,
      iban: props.iban ?? null,
      address: props.address ?? null,
      birthDate: props.birthDate ?? null,
      socialSecurityNumber: props.socialSecurityNumber ?? null,
      idCardNumber: props.idCardNumber ?? null,
      nationality: props.nationality ?? null,
      emergencyContactName: props.emergencyContactName ?? null,
      emergencyContactPhone: props.emergencyContactPhone ?? null,
      photoStoragePath: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: EmployeeProps): Employee {
    return new Employee(props);
  }

  update(data: UpdateEmployeeData): Employee {
    if (data.fullName !== undefined && data.fullName.trim().length === 0) {
      throw new InvalidEmployeeError("fullName é obrigatório");
    }
    const props = this.toProps();
    return new Employee({
      ...props,
      fullName: data.fullName !== undefined ? data.fullName.trim() : props.fullName,
      email: data.email !== undefined ? data.email : props.email,
      phone: data.phone !== undefined ? data.phone : props.phone,
      roleOrNotes: data.roleOrNotes !== undefined ? data.roleOrNotes : props.roleOrNotes,
      employmentType: data.employmentType !== undefined ? data.employmentType : props.employmentType,
      jobRole: data.jobRole !== undefined ? data.jobRole : props.jobRole,
      hiredAt: data.hiredAt !== undefined ? data.hiredAt : props.hiredAt,
      endedAt: data.endedAt !== undefined ? data.endedAt : props.endedAt,
      baseSalary: data.baseSalary !== undefined ? data.baseSalary : props.baseSalary,
      salaryType: data.salaryType !== undefined ? data.salaryType : props.salaryType,
      hourlyRate: data.hourlyRate !== undefined ? data.hourlyRate : props.hourlyRate,
      nif: data.nif !== undefined ? data.nif : props.nif,
      iban: data.iban !== undefined ? data.iban : props.iban,
      address: data.address !== undefined ? data.address : props.address,
      birthDate: data.birthDate !== undefined ? data.birthDate : props.birthDate,
      socialSecurityNumber:
        data.socialSecurityNumber !== undefined ? data.socialSecurityNumber : props.socialSecurityNumber,
      idCardNumber: data.idCardNumber !== undefined ? data.idCardNumber : props.idCardNumber,
      nationality: data.nationality !== undefined ? data.nationality : props.nationality,
      emergencyContactName:
        data.emergencyContactName !== undefined ? data.emergencyContactName : props.emergencyContactName,
      emergencyContactPhone:
        data.emergencyContactPhone !== undefined ? data.emergencyContactPhone : props.emergencyContactPhone,
      updatedAt: new Date().toISOString(),
    });
  }

  activate(): Employee {
    return new Employee({ ...this.toProps(), status: "active", updatedAt: new Date().toISOString() });
  }

  deactivate(): Employee {
    return new Employee({
      ...this.toProps(),
      status: "inactive",
      endedAt: this.endedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  updatePhoto(photoStoragePath: string | null): Employee {
    return new Employee({ ...this.toProps(), photoStoragePath, updatedAt: new Date().toISOString() });
  }

  toProps(): EmployeeProps {
    return {
      id: this.id,
      fullName: this.fullName,
      email: this.email,
      phone: this.phone,
      roleOrNotes: this.roleOrNotes,
      employmentType: this.employmentType,
      jobRole: this.jobRole,
      status: this.status,
      hiredAt: this.hiredAt,
      endedAt: this.endedAt,
      baseSalary: this.baseSalary,
      salaryType: this.salaryType,
      hourlyRate: this.hourlyRate,
      nif: this.nif,
      iban: this.iban,
      address: this.address,
      birthDate: this.birthDate,
      socialSecurityNumber: this.socialSecurityNumber,
      idCardNumber: this.idCardNumber,
      nationality: this.nationality,
      emergencyContactName: this.emergencyContactName,
      emergencyContactPhone: this.emergencyContactPhone,
      photoStoragePath: this.photoStoragePath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
