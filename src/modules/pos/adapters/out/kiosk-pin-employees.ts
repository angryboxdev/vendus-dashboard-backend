import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PosEmployeesPort } from "../../domain/ports/out/pos.ports.js";

/**
 * Funcionários ativos com o PIN do quiosque de ponto (`hr_employees`, só
 * leitura) — o mesmo PIN que o fecho de caixa usa. O hash (HMAC com o segredo
 * do quiosque) é injetado pelo composition root.
 */
export class KioskPinEmployees implements PosEmployeesPort {
  constructor(
    private readonly scoped: ScopedQueryFactory,
    private readonly hashPin: (pin: string) => string,
  ) {}

  async findActiveByPin(org: OrganizationId, pin: string) {
    const { data, error } = await this.scoped(org)
      .table("hr_employees")
      .select("id, full_name")
      .eq("kiosk_pin_hash", this.hashPin(pin))
      .eq("status", "active")
      .limit(2);
    if (error) throw new Error(`POS: erro a validar o PIN: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<{ id: string; full_name: string }>;
    // Dois funcionários com o mesmo PIN: não adivinhar quem é.
    return rows.length === 1 ? { id: rows[0]!.id, name: rows[0]!.full_name } : null;
  }

  async listActive(org: OrganizationId) {
    const { data, error } = await this.scoped(org).table("hr_employees").select("id, full_name").eq("status", "active").order("full_name", { ascending: true });
    if (error) throw new Error(`POS: erro a ler os funcionários: ${error.message}`);
    return ((data ?? []) as unknown as Array<{ id: string; full_name: string }>).map((r) => ({ id: r.id, name: r.full_name }));
  }
}
