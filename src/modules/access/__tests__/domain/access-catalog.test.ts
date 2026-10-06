import { readFileSync } from "fs";
import { join } from "path";
import { ACCESS_CATALOG, ALL_PERMISSION_KEYS, SYSTEM_PROFILE_DEFAULTS } from "../../domain/catalog.js";
import { can, effectivePermissions, moduleBulk, sanitizePermissionMap, summarizeModules } from "../../domain/services/effective-access.service.js";

const manager = SYSTEM_PROFILE_DEFAULTS.manager.permissions;

describe("Catálogo de permissões", () => {
  it("chaves únicas e todas com prefixo do seu módulo", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
    for (const mod of ACCESS_CATALOG) {
      for (const k of [...mod.functions, ...mod.specials].map((x) => x.key)) expect(k.startsWith(`${mod.key}.`)).toBe(true);
    }
  });

  it("os valores iniciais dos perfis só usam chaves do catálogo", () => {
    for (const p of Object.values(SYSTEM_PROFILE_DEFAULTS)) {
      for (const key of Object.keys(p.permissions)) expect(ALL_PERMISSION_KEYS).toContain(key);
    }
  });

  it("a migração semeia exatamente os valores do catálogo (sem divergência)", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261008110000_access_profiles.sql"), "utf8");
    for (const [key, p] of Object.entries(SYSTEM_PROFILE_DEFAULTS)) {
      const match = sql.match(new RegExp(`\\('${key}', '[^']*', '[^']*', (?:true|false), '([^']*)'::jsonb\\)`));
      expect(match).not.toBeNull();
      expect(JSON.parse(match![1]!)).toEqual(p.permissions);
    }
  });
});

describe("Permissão efetiva (perfil + exceções)", () => {
  it("exceção prevalece; sem exceção herda o valor atual do perfil", () => {
    const eff = effectivePermissions(manager, { "stock.items": "READ" }, false);
    expect(eff["stock.items"]).toBe("READ");
    expect(eff["stock.movements"]).toBe("MANAGE");
    expect(eff["finance.invoices"]).toBe("NONE");
    // herança dinâmica: o perfil muda, quem herda acompanha; a exceção fica
    const changed = { ...manager, "crm.customers": "READ" as const, "stock.items": "NONE" as const };
    const eff2 = effectivePermissions(changed, { "stock.items": "READ" }, false);
    expect(eff2["crm.customers"]).toBe("READ");
    expect(eff2["stock.items"]).toBe("READ");
  });

  it("Admin tem sempre tudo; desativado nunca pode nada", () => {
    const admin = { isAdmin: true, active: true, permissions: {} };
    expect(can(admin, "finance.invoices", "MANAGE")).toBe(true);
    expect(can({ ...admin, active: false }, "finance.invoices", "READ")).toBe(false);
  });

  it("READ permite consultar mas não gerir; especiais exigem MANAGE (READ não conta)", () => {
    const s = { isAdmin: false, active: true, permissions: effectivePermissions(manager, { "hr.sensitive_data": "READ" }, false) };
    expect(can(s, "hr.employees", "READ")).toBe(true);
    expect(can(s, "hr.employees", "MANAGE")).toBe(false);
    expect(can(s, "hr.schedules", "MANAGE")).toBe(true);
    expect(can(s, "hr.sensitive_data", "READ")).toBe(false);
  });

  it("controlo rápido por módulo e resumo (Sem acesso → exceção Faturas READ → Personalizado)", () => {
    const overrides = { ...moduleBulk("finance", "NONE"), "finance.invoices": "READ" as const };
    const eff = effectivePermissions(SYSTEM_PROFILE_DEFAULTS.financeiro.permissions, overrides, false);
    const finance = summarizeModules(eff, overrides).find((m) => m.moduleKey === "finance")!;
    expect(finance).toMatchObject({ state: "mixed", granted: 1, customized: true });
    const stock = summarizeModules(effectivePermissions(manager, {}, false), {}).find((m) => m.moduleKey === "stock")!;
    expect(stock).toMatchObject({ state: "manage_all", customized: false });
  });

  it("sanitize ignora chaves desconhecidas e valores inválidos", () => {
    expect(sanitizePermissionMap({ "finance.invoices": "READ", "x.y": "MANAGE", "crm.contacts": "ADMIN", "hr.reopen_month": "READ" })).toEqual({
      "finance.invoices": "READ",
      "hr.reopen_month": "NONE",
    });
  });
});
