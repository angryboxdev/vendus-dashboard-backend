import type { SupabaseClient } from "@supabase/supabase-js";
import type { Employee, EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";

export class SupabaseEmployeeRepository implements EmployeeRepositoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findActiveByPinHash(pinHash: string): Promise<Employee | null> {
    const { data, error } = await this.supabase
      .from("hr_employees")
      .select("id, full_name")
      .eq("kiosk_pin_hash", pinHash)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return { id: data.id as string, fullName: data.full_name as string };
  }

  async findActiveById(id: string): Promise<Employee | null> {
    const { data, error } = await this.supabase
      .from("hr_employees")
      .select("id, full_name")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return { id: data.id as string, fullName: data.full_name as string };
  }
}
