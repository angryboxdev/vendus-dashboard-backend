import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { EmploymentUseCases } from "../../application/use-cases/employment.use-cases.js";
import { PeopleUseCases } from "../../application/use-cases/people.use-cases.js";
import { PeopleConflictError, PeopleForbiddenError, PeopleNotFoundError, PeopleRuleViolation, PeopleValidationError } from "../../domain/errors.js";
import { parseCsv } from "../../domain/services/csv.js";
import { FakePeopleRepo, viewer } from "../fakes/fake-people.js";

const ORG = mintOrganizationId("org-test");
const ADMIN = viewer({ isAdmin: true });

function setup() {
  const repo = new FakePeopleRepo();
  const disabled: string[] = [];
  const events: { action: string; before: unknown; after: unknown; reason: string | null }[] = [];
  const audit = { record: async (_o: unknown, e: (typeof events)[number]) => void events.push(e) };
  const clock = { today: async () => "2026-10-11" };
  const people = new PeopleUseCases(repo, { disableLinkedUser: async (_o, userId) => void disabled.push(userId) }, audit, clock);
  const employment = new EmploymentUseCases(repo, audit, clock);
  return { repo, people, employment, disabled, events };
}

const NEW = { firstName: " Carla ", lastName: "Demo", nif: "123 456 789", hireDate: "2026-10-01", primaryLocationId: "PRT", email: "carla@demo.invalid" };

describe("Ficha do colaborador (Novo RH, Fase 2)", () => {
  test("RE_1_nome_e_apelido_sao_obrigatorios", async () => {
    const { people } = setup();
    await expect(people.create(ORG, ADMIN, { ...NEW, firstName: "" })).rejects.toMatchObject({ field: "firstName" });
    await expect(people.create(ORG, ADMIN, { ...NEW, lastName: "  " })).rejects.toMatchObject({ field: "lastName" });
    await expect(people.create(ORG, ADMIN, { ...NEW, nif: "" })).rejects.toMatchObject({ field: "nif" }); // D4
    const e = await people.create(ORG, ADMIN, NEW);
    expect(e).toMatchObject({ firstName: "Carla", lastName: "Demo", fullName: "Carla Demo", nif: "123456789", primaryLocationId: "loc-porto", missing: [] });
  });

  test("RE_2_documento_duplicado_e_recusado_com_409", async () => {
    const { people } = setup();
    await people.create(ORG, ADMIN, NEW);
    const err = await people.create(ORG, ADMIN, { ...NEW, firstName: "Outra", nif: "123456789" }).catch((e) => e);
    expect(err).toBeInstanceOf(PeopleConflictError);
    expect(err).toMatchObject({ code: "duplicate_document", field: "nif" });
  });

  test("privacidade por campo: escondido na ficha; sem permissão não se edita; sensível exige motivo", async () => {
    const { people, repo } = setup();
    repo.seed({ id: "e1", firstName: "Rui", lastName: "Teste", nif: "999888777", iban: "PT50000201231234567890154", hireDate: "2025-01-01", primaryLocationId: "loc-porto" });
    const rh = viewer({ hidden: ["identification.iban"], readOnly: ["identification.nif"] });
    const v = await people.get(ORG, rh, "e1");
    expect(v.iban).toBeNull();
    expect(v.hidden).toContain("iban");
    expect(v.nif).toBe("999888777");
    await expect(people.update(ORG, rh, "e1", { nif: "111222333" }, 1, "correção")).rejects.toBeInstanceOf(PeopleForbiddenError);
    await expect(people.update(ORG, ADMIN, "e1", { iban: "PT50000201231234567890155" }, 1, null)).rejects.toThrow("motivo");
    const ok = await people.update(ORG, ADMIN, "e1", { iban: "PT50000201231234567890155", firstName: "Rui Pedro" }, 1, "novo banco");
    expect(ok).toMatchObject({ fullName: "Rui Pedro Teste", version: 2 });
    await expect(people.update(ORG, ADMIN, "e1", { phone: "910000000" }, 1, null)).rejects.toMatchObject({ code: "version_conflict" });
    await expect(people.update(ORG, ADMIN, "e1", { primaryLocationId: "BRG" }, 2, null)).rejects.toThrow("transferência");
  });

  test("auditoria não guarda valores sensíveis", async () => {
    const { people, events } = setup();
    await people.create(ORG, ADMIN, { ...NEW, iban: "PT50000201231234567890154" });
    expect(JSON.stringify(events)).not.toContain("PT500002");
    expect(events[0]!.after).toMatchObject({ iban: "[registado]", nif: "[registado]" });
  });

  test("RE_4_desativacao_revoga_sessoes_e_mantem_os_dados", async () => {
    const { people, repo, disabled } = setup();
    repo.seed({ id: "e1", firstName: "Ana", lastName: "Teste", userId: "u-ana", hireDate: "2025-01-01" });
    await expect(people.deactivate(ORG, ADMIN, "e1", " ", 1)).rejects.toThrow("motivo");
    const d = await people.deactivate(ORG, ADMIN, "e1", "Fim do contrato", 1);
    expect(d).toMatchObject({ status: "inactive", deactivationReason: "Fim do contrato" });
    expect(disabled).toEqual(["u-ana"]);
    expect(await people.list(ORG, ADMIN, { status: "active" })).toEqual([]);
    expect((await people.list(ORG, ADMIN, { status: "all" })).map((e) => e.firstName)).toEqual(["Ana"]);
    const r = await people.reactivate(ORG, ADMIN, "e1", "Readmitida", 2);
    expect(r.status).toBe("active");
  });

  test("RE_34_fora_do_ambito_nao_aparece_na_pesquisa_nem_se_abre", async () => {
    const { people, repo } = setup();
    repo.seed({ id: "e-porto", firstName: "Porto", lastName: "Um" });
    repo.seed({ id: "e-braga", firstName: "Braga", lastName: "Dois" });
    const gerentePorto = viewer({ scope: ["e-porto"] });
    expect((await people.list(ORG, gerentePorto, {})).map((e) => e.id)).toEqual(["e-porto"]);
    await expect(people.get(ORG, gerentePorto, "e-braga")).rejects.toBeInstanceOf(PeopleNotFoundError);
    const { csv } = await people.exportCsv(ORG, gerentePorto, {});
    expect(csv).toContain("Porto");
    expect(csv).not.toContain("Braga");
  });

  test("RE_3_exportacao_nao_inclui_colunas_sem_permissao", async () => {
    const { people, repo } = setup();
    repo.seed({ id: "e1", firstName: "Ana", lastName: "Teste", iban: "PT50000201231234567890154", nif: "123456789" });
    const semIban = viewer({ hidden: ["identification.iban", "work.salary"] });
    const { csv, columns } = await people.exportCsv(ORG, semIban, {});
    expect(columns).not.toContain("iban");
    expect(columns).not.toContain("baseSalary");
    expect(csv).not.toContain("IBAN");
    expect(csv).not.toContain("PT500002");
    expect(parseCsv(csv).header).toContain("NIF");
    await expect(people.exportCsv(ORG, viewer({ canExport: false }), {})).rejects.toBeInstanceOf(PeopleForbiddenError);
  });

  test("importação CSV: simula, aponta erros por linha e só grava se tudo estiver válido", async () => {
    const { people, repo } = setup();
    repo.seed({ id: "e0", firstName: "Já", lastName: "Existe", nif: "555555555" });
    const csv = "nome;apelido;nif;data_admissao;centro\nAna;Silva;111111111;2026-10-01;PRT\n;Sem Nome;222222222;2026-10-01;PRT\nRui;Dup;555555555;2026-10-01;BRG\nEva;Lua;333333333;2026-10-01;MARTE\n";
    const sim = await people.importCsv(ORG, ADMIN, csv, true);
    expect(sim).toMatchObject({ total: 4, valid: 1, created: 0 });
    expect(sim.rows.map((r) => [r.line, r.ok])).toEqual([
      [2, true],
      [3, false],
      [4, false],
      [5, false],
    ]);
    expect(sim.rows[2]!.errors.join()).toContain("Já existe");
    const notAll = await people.importCsv(ORG, ADMIN, csv, false);
    expect(notAll.created).toBe(0);
    const good = await people.importCsv(ORG, ADMIN, "nome;apelido;nif;data_admissao;centro\nAna;Silva;111111111;2026-10-01;PRT\nRui;Costa;444444444;2026-10-02;BRG\n", false);
    expect(good.created).toBe(2);
    await expect(people.importCsv(ORG, ADMIN, "nome;apelido\nA;B\n", true)).rejects.toThrow("Faltam colunas");
  });
});

describe("Foto da ficha", () => {
  test("lista e ficha trazem photoUrl assinado (um pedido por lista) e nunca o caminho guardado", async () => {
    const repo = new FakePeopleRepo();
    const calls: string[][] = [];
    const photos = { urls: async (_o: unknown, paths: string[]) => (calls.push(paths), new Map(paths.map((p) => [p, `https://signed/${p}`]))) };
    const people = new PeopleUseCases(repo, { disableLinkedUser: async () => undefined }, { record: async () => undefined }, { today: async () => "2026-10-11" }, photos);
    repo.seed({ id: "e1", firstName: "Ana", lastName: "Demo", photoPath: "org/a.jpg" });
    repo.seed({ id: "e2", firstName: "Rui", lastName: "Demo" });
    const list = await people.list(ORG, ADMIN, {});
    expect(list.map((e) => e.photoUrl)).toEqual(["https://signed/org/a.jpg", null]);
    expect(list[0]).not.toHaveProperty("photoPath");
    expect(calls).toEqual([["org/a.jpg"]]);
    expect((await people.get(ORG, ADMIN, "e1")).photoUrl).toBe("https://signed/org/a.jpg");
  });

  test("sem adapter de fotos, photoUrl é null", async () => {
    const { repo, people } = setup();
    repo.seed({ id: "e1", firstName: "Ana", lastName: "Demo", photoPath: "org/a.jpg" });
    expect((await people.list(ORG, ADMIN, {}))[0]!.photoUrl).toBeNull();
  });
});

describe("Contratos, responsáveis, remuneração e campos personalizados", () => {
  const C = { contractType: "permanent" as const, code: null, startDate: "2026-01-01", endDate: null, seniorityDate: null, probationEnd: null, weeklyHours: 40, fte: 1, agreementId: null, remote: false, comment: null };

  test("TK_9_contratos_sobrepostos_sao_recusados_com_409", async () => {
    const { employment, repo } = setup();
    repo.seed({ id: "e1", firstName: "Ana", lastName: "Teste" });
    await expect(employment.createContract(ORG, ADMIN, "e1", { ...C, startDate: "" })).rejects.toThrow("início");
    const c1 = await employment.createContract(ORG, ADMIN, "e1", { ...C, endDate: "2026-06-30" });
    const err = await employment.createContract(ORG, ADMIN, "e1", { ...C, startDate: "2026-06-01" }).catch((e) => e);
    expect(err).toMatchObject({ code: "contract_overlap" });
    await expect(employment.createContract(ORG, ADMIN, "e1", { ...C, startDate: "2026-07-01" })).resolves.toBeDefined();
    // Anular liberta o período; alterar exige motivo.
    await expect(employment.updateContract(ORG, ADMIN, "e1", c1.id, { ...C, endDate: "2026-05-31" }, 1, " ")).rejects.toThrow("motivo");
    await employment.cancelContract(ORG, ADMIN, "e1", c1.id, 1, "Erro de registo");
    await expect(employment.createContract(ORG, ADMIN, "e1", { ...C, startDate: "2026-02-01", endDate: "2026-06-30" })).resolves.toBeDefined();
  });

  test("CF_14_complemento_numa_moeda_diferente_e_recusado", async () => {
    const { employment, repo } = setup();
    repo.seed({ id: "e1", firstName: "Ana", lastName: "Teste", currency: "EUR", payPeriod: "monthly" });
    const usd = await employment.createCompensationItem(ORG, "admin", { kind: "complement", name: "Prémio USD", code: null, mode: "fixed", amount: 50, employeeAmount: null, currency: "USD", payPeriod: "monthly", everyNMonths: 1 });
    const err = await employment.assignCompensation(ORG, ADMIN, { employeeId: "e1", itemId: usd.id, amount: null, validFrom: "2026-10-01", validTo: null }).catch((e) => e);
    expect(err).toBeInstanceOf(PeopleRuleViolation);
    expect(err).toMatchObject({ rule: "currency_mismatch" });
    const eur = await employment.createCompensationItem(ORG, "admin", { kind: "benefit", name: "Seguro", code: null, mode: "copayment", amount: 30, employeeAmount: 10, currency: "EUR", payPeriod: "weekly", everyNMonths: 1 });
    await expect(employment.assignCompensation(ORG, ADMIN, { employeeId: "e1", itemId: eur.id, amount: null, validFrom: "2026-10-01", validTo: null })).rejects.toMatchObject({ rule: "benefit_mismatch" });
    // Sem permissão de remuneração → não vê nem atribui.
    await expect(employment.listEmployeeCompensations(ORG, viewer({ hidden: ["work.salary"] }), "e1")).rejects.toBeInstanceOf(PeopleForbiddenError);
  });

  test("responsáveis: não a si próprio; um por tipo e nível de cada vez", async () => {
    const { employment, repo } = setup();
    repo.seed({ id: "e1", firstName: "Ana", lastName: "A" });
    repo.seed({ id: "e2", firstName: "Bia", lastName: "B" });
    repo.seed({ id: "e3", firstName: "Cid", lastName: "C" });
    const base = { employeeId: "e1", kind: "approver_leave" as const, level: 1, validFrom: "2026-10-01", validTo: null };
    await expect(employment.addManager(ORG, ADMIN, { ...base, managerEmployeeId: "e1" })).rejects.toThrow("si próprio");
    const m = await employment.addManager(ORG, ADMIN, { ...base, managerEmployeeId: "e2" });
    await expect(employment.addManager(ORG, ADMIN, { ...base, managerEmployeeId: "e3" })).rejects.toThrow("Termine o atual");
    await expect(employment.addManager(ORG, ADMIN, { ...base, managerEmployeeId: "e3", level: 2 })).resolves.toBeDefined();
    await employment.endManager(ORG, ADMIN, "e1", m.id, "2026-10-31");
    await expect(employment.addManager(ORG, ADMIN, { ...base, managerEmployeeId: "e3", validFrom: "2026-11-01" })).resolves.toBeDefined();
  });

  test("campos personalizados: opções validadas; sensíveis escondidos sem permissão", async () => {
    const { employment, repo } = setup();
    repo.seed({ id: "e1", firstName: "Ana", lastName: "A" });
    const tam = await employment.createCustomField(ORG, "admin", { section: "work", name: "Tamanho farda", format: "options", options: ["S", "M", "L"], sensitive: false });
    const saude = await employment.createCustomField(ORG, "admin", { section: "personal", name: "Restrição médica", format: "text", options: [], sensitive: true });
    await expect(employment.createCustomField(ORG, "admin", { section: "work", name: "tamanho farda", format: "text", options: [], sensitive: false })).rejects.toBeInstanceOf(PeopleValidationError);
    await expect(employment.setCustomValues(ORG, ADMIN, "e1", { [tam.id]: "XXL" })).rejects.toThrow("opção inválida");
    await employment.setCustomValues(ORG, ADMIN, "e1", { [tam.id]: "M", [saude.id]: "Sem cargas" });
    const rh = viewer();
    const seen = await employment.getCustomValues(ORG, rh, "e1");
    expect(seen.find((v) => v.field.id === saude.id)).toMatchObject({ value: null, hidden: true });
    expect(seen.find((v) => v.field.id === tam.id)?.value).toBe("M");
    await expect(employment.setCustomValues(ORG, rh, "e1", { [saude.id]: "x" })).rejects.toBeInstanceOf(PeopleForbiddenError);
  });
});
