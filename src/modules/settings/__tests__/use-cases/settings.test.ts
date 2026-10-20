import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import type { SettingDefinition } from "../../domain/entities/setting-definition.js";
import { RetroactiveNotAllowed, SettingRuleViolation, SettingValidationError } from "../../domain/errors.js";
import { SETTING_CATALOG } from "../../domain/services/setting-catalog.js";
import { SettingsUseCases } from "../../application/use-cases/settings.use-cases.js";
import { FakeAudit, FakeClock, FakeImpact, FakeSegments, FakeSettingsRepository } from "../fakes/fake-settings.js";

const ORG = mintOrganizationId("org-test");
const ADMIN = { userId: "u-admin", canRetroactive: false };
const RETRO = { userId: "u-admin", canRetroactive: true };
const TOL = "time_tracking.tolerance.minutes";

function setup(segments: FakeSegments = new FakeSegments(), catalog: SettingDefinition[] = SETTING_CATALOG) {
  const repo = new FakeSettingsRepository();
  const impact = new FakeImpact();
  const clock = new FakeClock("2026-10-11");
  const audit = new FakeAudit();
  const uc = new SettingsUseCases(repo, segments, impact, clock, catalog, audit);
  return { repo, impact, clock, uc, audit };
}

async function effective(uc: SettingsUseCases, employeeId: string, date: string, key = TOL) {
  const all = await uc.effectiveFor(ORG, employeeId, date);
  return all.find((s) => s.key === key)!;
}

describe("Motor de configurações — cascata (C11.2)", () => {
  test("CF_1_cascata_global_pessoal_e_volta_ao_global_ao_desativar_a_pessoal", async () => {
    const { uc } = setup();
    const global = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global", kind: "global" }, ADMIN);
    await uc.setValue(ORG, global.id, { key: TOL, value: 15, validFrom: "2026-10-11", reason: "Regra da empresa" }, ADMIN);
    const personal = await uc.createProfile(ORG, { domain: "time_tracking", name: "Pessoal E1", kind: "personal" }, ADMIN);
    await uc.addTarget(ORG, personal.id, { targetType: "employee", targetId: "e1", validFrom: "2026-10-11", validTo: null }, ADMIN);
    await uc.setValue(ORG, personal.id, { key: TOL, value: 5, validFrom: "2026-10-11", reason: "Acordo individual" }, ADMIN);

    const withPersonal = await effective(uc, "e1", "2026-10-11");
    expect(withPersonal.value).toBe(5);
    expect(withPersonal.origin).toMatchObject({ level: "personal", profileName: "Pessoal E1" });
    expect(withPersonal.inherited).toMatchObject({ value: 15, origin: { level: "global" } });
    expect((await effective(uc, "e2", "2026-10-11")).value).toBe(15);

    // "Desativar a pessoal" = a pessoal deixa de definir a chave.
    await uc.setValue(ORG, personal.id, { key: TOL, value: null, validFrom: "2026-10-12", reason: "Fim do acordo" }, ADMIN);
    expect((await effective(uc, "e1", "2026-10-12")).value).toBe(15);
    expect((await effective(uc, "e1", "2026-10-11")).value).toBe(5);
  });

  test("sem nenhum perfil vale o default do catálogo, com origem 'system'", async () => {
    const { uc } = setup();
    const s = await effective(uc, "e1", "2026-10-11");
    expect(s).toEqual({ key: TOL, value: 0, origin: { level: "system", profileId: null, profileName: null, valueId: null, validFrom: null }, inherited: null });
  });

  test("TK_8_colaborador_em_dois_segmentos_recebe_sempre_o_mesmo_valor_pela_ordem_D3", async () => {
    const segments = new FakeSegments({ e1: { locationIds: ["loc-porto"], departmentIds: ["dep-cozinha"], groupIds: ["grp-a", "grp-b"] } });
    const { uc } = setup(segments);
    const mk = async (name: string, targetType: "location" | "department" | "group", targetId: string, value: number, from = "2026-10-01") => {
      const p = await uc.createProfile(ORG, { domain: "time_tracking", name, kind: "segment" }, ADMIN);
      await uc.addTarget(ORG, p.id, { targetType, targetId, validFrom: from, validTo: null }, RETRO);
      await uc.setValue(ORG, p.id, { key: TOL, value, validFrom: "2026-10-11", reason: "teste" }, ADMIN);
      return p;
    };
    await mk("Centro Porto", "location", "loc-porto", 30);
    expect((await effective(uc, "e1", "2026-10-11")).origin.level).toBe("location");
    await mk("Cozinha", "department", "dep-cozinha", 20);
    expect((await effective(uc, "e1", "2026-10-11")).value).toBe(20); // departamento > centro
    await mk("Grupo B", "group", "grp-b", 10, "2026-10-01");
    await mk("Grupo A", "group", "grp-a", 12, "2026-10-05");
    // grupo > departamento; entre dois grupos ganha o alvo mais recente (Grupo A, 05/10)
    const runs = await Promise.all([1, 2, 3].map(() => effective(uc, "e1", "2026-10-11")));
    expect(runs.map((r) => r.value)).toEqual([12, 12, 12]);
    expect(runs[0]!.origin.profileName).toBe("Grupo A");
    expect(runs[0]!.inherited?.value).toBe(10);
  });

  test("alvo com vigência terminada deixa de contar", async () => {
    const segments = new FakeSegments({ e1: { locationIds: ["loc-1"], departmentIds: [], groupIds: [] } });
    const { uc } = setup(segments);
    const p = await uc.createProfile(ORG, { domain: "time_tracking", name: "Loja 1", kind: "segment" }, ADMIN);
    await uc.addTarget(ORG, p.id, { targetType: "location", targetId: "loc-1", validFrom: "2026-10-11", validTo: "2026-10-31" }, ADMIN);
    await uc.setValue(ORG, p.id, { key: TOL, value: 9, validFrom: "2026-10-11", reason: "teste" }, ADMIN);
    expect((await effective(uc, "e1", "2026-10-31")).value).toBe(9);
    expect((await effective(uc, "e1", "2026-11-01")).value).toBe(0);
  });
});

describe("Motor de configurações — data de efeito (TK-6)", () => {
  test("TK_6_valor_com_data_futura_nao_altera_o_valor_de_hoje", async () => {
    const { uc } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global", kind: "global" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: TOL, value: 15, validFrom: "2026-10-11", reason: "inicial" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: TOL, value: 10, validFrom: "2026-11-01", reason: "nova regra" }, ADMIN);
    expect((await effective(uc, "e1", "2026-10-11")).value).toBe(15);
    expect((await effective(uc, "e1", "2026-11-01")).value).toBe(10);
  });

  test("alteração retroativa avisa os Admins (notificação); a de hoje não", async () => {
    const repo = new FakeSettingsRepository();
    const calls: unknown[] = [];
    const uc = new SettingsUseCases(repo, new FakeSegments(), new FakeImpact(3), new FakeClock("2026-10-11"), SETTING_CATALOG, new FakeAudit(), {
      retroactiveChange: async (_o, info) => void calls.push(info),
    });
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global", kind: "global" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: TOL, value: 5, validFrom: "2026-10-11", reason: "hoje" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: TOL, value: 7, validFrom: "2026-10-09", reason: "corrigir" }, RETRO);
    expect(calls).toEqual([expect.objectContaining({ label: "Tolerância de entrada", profileName: "Global", validFrom: "2026-10-09", employees: 3, pastDays: 2 })]);
  });

  test("TK_6_data_passada_exige_permissao_retroativa_e_devolve_impacto", async () => {
    const { uc, impact } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global", kind: "global" }, ADMIN);
    await expect(uc.setValue(ORG, g.id, { key: TOL, value: 5, validFrom: "2026-10-01", reason: "corrigir" }, ADMIN)).rejects.toBeInstanceOf(RetroactiveNotAllowed);
    const res = await uc.setValue(ORG, g.id, { key: TOL, value: 5, validFrom: "2026-10-01", reason: "corrigir" }, RETRO);
    expect(res.impact).toEqual({ employees: 7, pastDays: 10, validFrom: "2026-10-01" });
    expect(impact.calls).toEqual([{ allEmployees: true }]);
    const today = await uc.setValue(ORG, g.id, { key: TOL, value: 6, validFrom: "2026-10-11", reason: "hoje" }, ADMIN);
    expect(today.impact).toBeNull();
  });
});

describe("Motor de configurações — dependências e validação (TK-7)", () => {
  const WARN = "notifications.auto_close_warning.enabled";
  const AUTO = "time_tracking.auto_close.enabled";

  test("TK_7_ativar_aviso_sem_fecho_automatico_e_recusado_com_rule_violation", async () => {
    const { uc } = setup();
    const n = await uc.createProfile(ORG, { domain: "notifications", name: "Global notificações", kind: "global" }, ADMIN);
    const err = await uc.setValue(ORG, n.id, { key: WARN, value: true, validFrom: "2026-10-11", reason: "ativar" }, ADMIN).catch((e) => e);
    expect(err).toBeInstanceOf(SettingRuleViolation);
    expect(err).toMatchObject({ code: "rule_violation", requires: { key: AUTO, equals: true } });

    const t = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global ponto", kind: "global" }, ADMIN);
    await uc.setValue(ORG, t.id, { key: AUTO, value: true, validFrom: "2026-10-11", reason: "ativar fecho" }, ADMIN);
    await expect(uc.setValue(ORG, n.id, { key: WARN, value: true, validFrom: "2026-10-11", reason: "ativar" }, ADMIN)).resolves.toBeDefined();
  });

  test("TK_7_desligar_o_requisito_com_o_dependente_ativo_tambem_e_recusado", async () => {
    const { uc } = setup();
    const t = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global ponto", kind: "global" }, ADMIN);
    const n = await uc.createProfile(ORG, { domain: "notifications", name: "Global notificações", kind: "global" }, ADMIN);
    await uc.setValue(ORG, t.id, { key: AUTO, value: true, validFrom: "2026-10-11", reason: "a" }, ADMIN);
    await uc.setValue(ORG, n.id, { key: WARN, value: true, validFrom: "2026-10-11", reason: "b" }, ADMIN);
    await expect(uc.setValue(ORG, t.id, { key: AUTO, value: false, validFrom: "2026-10-12", reason: "c" }, ADMIN)).rejects.toBeInstanceOf(SettingRuleViolation);
  });

  test.each([
    [TOL, "15", "inteiro"],
    [TOL, 500, "máximo"],
    [TOL, -1, "mínimo"],
    [AUTO, "sim", "sim ou não"],
  ])("valor inválido para %s (%p) é recusado", async (key, value, msg) => {
    const { uc } = setup();
    const domain = key.startsWith("time") ? "time_tracking" : "notifications";
    const g = await uc.createProfile(ORG, { domain, name: "G", kind: "global" }, ADMIN);
    await expect(uc.setValue(ORG, g.id, { key, value: value as never, validFrom: "2026-10-11", reason: "x" }, ADMIN)).rejects.toThrow(msg);
  });

  test("motivo obrigatório; parâmetro de outro domínio recusado", async () => {
    const { uc } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "G", kind: "global" }, ADMIN);
    await expect(uc.setValue(ORG, g.id, { key: TOL, value: 5, validFrom: "2026-10-11", reason: "  " }, ADMIN)).rejects.toThrow("motivo");
    await expect(uc.setValue(ORG, g.id, { key: "security.session.inactivity_minutes", value: 30, validFrom: "2026-10-11", reason: "x" }, ADMIN)).rejects.toThrow("domínio");
  });
});

describe("Motor de configurações — perfis, alvos e histórico", () => {
  test("nomes únicos por domínio e uma só configuração global", async () => {
    const { uc } = setup();
    await uc.createProfile(ORG, { domain: "time_tracking", name: "Global", kind: "global" }, ADMIN);
    await expect(uc.createProfile(ORG, { domain: "time_tracking", name: "global ", kind: "segment" }, ADMIN)).rejects.toBeInstanceOf(SettingValidationError);
    await expect(uc.createProfile(ORG, { domain: "time_tracking", name: "Outra", kind: "global" }, ADMIN)).rejects.toThrow("já tem uma configuração global");
  });

  test("alvos: tipo compatível com o perfil e sem sobreposição", async () => {
    const { uc } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "G", kind: "global" }, ADMIN);
    await expect(uc.addTarget(ORG, g.id, { targetType: "location", targetId: "l1", validFrom: "2026-10-11", validTo: null }, ADMIN)).rejects.toThrow("não tem alvos");
    const p = await uc.createProfile(ORG, { domain: "time_tracking", name: "P", kind: "personal" }, ADMIN);
    await expect(uc.addTarget(ORG, p.id, { targetType: "group", targetId: "g1", validFrom: "2026-10-11", validTo: null }, ADMIN)).rejects.toThrow("tipo de alvo");
    await uc.addTarget(ORG, p.id, { targetType: "employee", targetId: "e1", validFrom: "2026-10-11", validTo: "2026-12-31" }, ADMIN);
    await expect(uc.addTarget(ORG, p.id, { targetType: "employee", targetId: "e1", validFrom: "2026-12-01", validTo: null }, ADMIN)).rejects.toThrow("nesse período");
    await expect(uc.addTarget(ORG, p.id, { targetType: "employee", targetId: "e1", validFrom: "2027-01-01", validTo: null }, ADMIN)).resolves.toBeDefined();
    await expect(uc.addTarget(ORG, p.id, { targetType: "employee", targetId: "e2", validFrom: "2026-10-01", validTo: null }, ADMIN)).rejects.toBeInstanceOf(RetroactiveNotAllowed);
  });

  test("cada escrita fica na auditoria transversal (antes, depois, motivo; retroativo com ação própria)", async () => {
    const { uc, audit } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global", kind: "global" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: TOL, value: 15, validFrom: "2026-10-11", reason: "inicial" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: TOL, value: 10, validFrom: "2026-10-05", reason: "corrigir" }, RETRO);
    expect(audit.events.map((e) => e.action)).toEqual(["settings.profile.create", "settings.value.set", "settings.value.set_retroactive"]);
    expect(audit.events[1]).toMatchObject({ before: { key: TOL, value: null }, after: { key: TOL, value: 15 }, reason: "inicial", actor: "u-admin" });
    expect(audit.events[2]!.after).toMatchObject({ value: 10, impact: { employees: 7, pastDays: 6 } });
  });

  test("política de sessão: predefinição, depois o valor da configuração global (perfil pessoal não conta)", async () => {
    const { uc } = setup();
    expect(await uc.sessionPolicy(ORG)).toEqual({ inactivityMinutes: 30, mfaRequired: false });
    const g = await uc.createProfile(ORG, { domain: "security", name: "Segurança", kind: "global" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: "security.session.inactivity_minutes", value: 15, validFrom: "2026-10-11", reason: "política" }, ADMIN);
    expect(await uc.sessionPolicy(ORG)).toEqual({ inactivityMinutes: 15, mfaRequired: false });
  });

  test("CF_12_historico_com_antes_depois_e_motivo", async () => {
    const { uc } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global", kind: "global" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: TOL, value: 15, validFrom: "2026-10-11", reason: "inicial" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: TOL, value: 10, validFrom: "2026-11-01", reason: "reduzir" }, ADMIN);
    const h = await uc.history(ORG, { key: TOL });
    expect(h.map((e) => [e.before, e.after, e.reason, e.profileName])).toEqual([
      [15, 10, "reduzir", "Global"],
      [null, 15, "inicial", "Global"],
    ]);
  });

  test("detalhe do perfil: valores em vigor hoje e versão que muda a cada escrita", async () => {
    const { uc } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "G", kind: "global" }, ADMIN);
    const v0 = (await uc.getProfile(ORG, g.id)).version;
    await uc.setValue(ORG, g.id, { key: TOL, value: 15, validFrom: "2026-10-11", reason: "a" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: TOL, value: 10, validFrom: "2026-11-01", reason: "b" }, ADMIN);
    const d = await uc.getProfile(ORG, g.id);
    expect(d.values.map((v) => v.value)).toEqual([15]);
    expect(d.version).not.toBe(v0);
  });
});

describe("Configurações da Fase 4 (C6.1, C9)", () => {
  test("CF_1_cascata_com_a_tolerancia_real_15_global_5_pessoal", async () => {
    const { uc } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global", kind: "global" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: "time_tracking.tolerance.minutes", value: 15, validFrom: "2026-10-11", reason: "política" }, ADMIN);
    const p = await uc.createProfile(ORG, { domain: "time_tracking", name: "Pessoal", kind: "personal" }, ADMIN);
    await uc.addTarget(ORG, p.id, { targetType: "employee", targetId: "e1", validFrom: "2026-10-11", validTo: null }, ADMIN);
    await uc.setValue(ORG, p.id, { key: "time_tracking.tolerance.minutes", value: 5, validFrom: "2026-10-11", reason: "acordo" }, ADMIN);
    expect((await effective(uc, "e1", "2026-10-11")).value).toBe(5);
    await uc.setValue(ORG, p.id, { key: "time_tracking.tolerance.minutes", value: null, validFrom: "2026-10-12", reason: "fim" }, ADMIN);
    expect((await effective(uc, "e1", "2026-10-12")).value).toBe(15);
  });

  test("CF_3_aviso_de_fecho_sem_fecho_automatico_e_recusado_com_422", async () => {
    const { uc } = setup();
    const n = await uc.createProfile(ORG, { domain: "notifications", name: "N", kind: "global" }, ADMIN);
    await expect(uc.setValue(ORG, n.id, { key: "notifications.auto_close_warning.enabled", value: true, validFrom: "2026-10-11", reason: "x" }, ADMIN)).rejects.toMatchObject({ code: "rule_violation" });
  });

  test("CF_4_nao_se_pode_desativar_o_unico_metodo_do_quiosque", async () => {
    const { uc } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "G", kind: "global" }, ADMIN);
    await expect(uc.setValue(ORG, g.id, { key: "time_tracking.kiosk.methods", value: [], validFrom: "2026-10-11", reason: "x" }, ADMIN)).rejects.toThrow("pelo menos um");
    await expect(uc.setValue(ORG, g.id, { key: "time_tracking.kiosk.methods", value: ["qr"], validFrom: "2026-10-11", reason: "x" }, ADMIN)).resolves.toBeDefined();
  });

  test("bloquear fora da zona exige exigir localização (C9)", async () => {
    const { uc } = setup();
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "G", kind: "global" }, ADMIN);
    await expect(uc.setValue(ORG, g.id, { key: "time_tracking.geofence.block_outside", value: true, validFrom: "2026-10-11", reason: "x" }, ADMIN)).rejects.toMatchObject({ code: "rule_violation" });
  });
});

describe("Valor da empresa (funcionalidades opcionais)", () => {
  test("setCompanyValue cria o perfil geral se faltar, grava a partir de hoje com motivo; o último do dia vale", async () => {
    const { uc } = setup();
    const KEY = "time_tracking.roster.coverage_enabled";
    expect(await uc.companyValue(ORG, KEY)).toBe(false);
    await uc.setCompanyValue(ORG, KEY, true, "Ligado nas Escalas", ADMIN);
    expect(await uc.companyValue(ORG, KEY)).toBe(true);
    await uc.setCompanyValue(ORG, KEY, false, "Desligado nas Escalas", ADMIN);
    expect(await uc.companyValue(ORG, KEY)).toBe(false);
    expect((await uc.listProfiles(ORG)).filter((p) => p.kind === "global" && p.domain === "time_tracking")).toHaveLength(1);
    await expect(uc.setCompanyValue(ORG, "nao.existe", true, "x", ADMIN)).rejects.toThrow();
  });
});

describe("Funcionalidades opcionais da empresa", () => {
  test("banco de horas e quiosque ligados por omissão (nada muda nas empresas existentes); as outras desligadas; seguem o perfil geral", async () => {
    const { uc } = setup();
    const f = await uc.features(ORG);
    expect(f).toMatchObject({ "time_tracking.bank.enabled": true, "time_tracking.kiosk.enabled": true, "time_tracking.roster.coverage_enabled": false, "security.mfa.required": false });
    await uc.setCompanyValue(ORG, "time_tracking.bank.enabled", false, "Desligado em Funcionalidades", ADMIN);
    expect((await uc.features(ORG))["time_tracking.bank.enabled"]).toBe(false);
  });
});

describe("Desempenho — fotografia em cache", () => {
  test("várias leituras seguidas leem a base uma vez; cada escrita limpa a cache; everTrue", async () => {
    const { uc, repo } = setup();
    const spy = jest.spyOn(repo, "loadSnapshot");
    await uc.effectiveFor(ORG, "e1", "2026-10-11");
    await uc.effectiveFor(ORG, "e2", "2026-10-12");
    await uc.listProfiles(ORG);
    expect(spy).toHaveBeenCalledTimes(1);
    const KEY = "time_tracking.bank.excess_validation";
    expect(await uc.everTrue(ORG, KEY)).toBe(false);
    const g = await uc.createProfile(ORG, { domain: "time_tracking", name: "Global", kind: "global" }, ADMIN);
    await uc.setValue(ORG, g.id, { key: KEY, value: true, validFrom: "2026-10-11", reason: "ligar" }, ADMIN);
    // A escrita limpou a cache: o valor novo vê-se logo.
    expect(await uc.everTrue(ORG, KEY)).toBe(true);
    expect((await effective(uc, "e1", "2026-10-11", KEY)).value).toBe(true);
  });
});
