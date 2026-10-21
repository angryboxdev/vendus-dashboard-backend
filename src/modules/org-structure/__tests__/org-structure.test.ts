import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { OrgStructureUseCases } from "../application/use-cases/org-structure.use-cases.js";
import { OrgStructureError, OrgStructureNotFound, wouldCreateCycle, type Assignment, type Contact, type Department, type Group, type TermsAcceptance, type UnitType } from "../domain/entities/org-structure.js";
import type { OrgStructureRepositoryPort } from "../domain/ports/out/org-structure.ports.js";
import { SETTING_CATALOG } from "../../settings/domain/services/setting-catalog.js";
import { resolveSetting } from "../../settings/domain/services/setting-resolution.js";

const ORG = mintOrganizationId("org-test");
const ACTOR = "admin@demo.invalid";

class FakeRepo implements OrgStructureRepositoryPort {
  deps: Department[] = [];
  groups: Group[] = [];
  asg: Assignment[] = [];
  contacts: Contact[] = [];
  terms: TermsAcceptance[] = [];
  employees = new Set(["e1", "e2"]);
  private n = 0;
  private id = (p: string) => `${p}${++this.n}`;
  private now = () => `2026-10-11T10:00:${String(this.n).padStart(2, "0")}Z`;

  async listDepartments() {
    return [...this.deps];
  }
  async createDepartment(_o: OrganizationId, i: { name: string }) {
    const d = { id: this.id("d"), name: i.name, archived: false, updatedAt: this.now() };
    this.deps.push(d);
    return d;
  }
  async updateDepartment(_o: OrganizationId, id: string, p: { name?: string; archived?: boolean }) {
    const d = this.deps.find((x) => x.id === id)!;
    Object.assign(d, p, { updatedAt: this.now() });
    return { ...d };
  }
  async listGroups() {
    return this.groups.map((g) => ({ ...g }));
  }
  async createGroup(_o: OrganizationId, i: Omit<Group, "id" | "archived" | "updatedAt">) {
    const g: Group = { id: this.id("g"), parentId: i.parentId, code: i.code, name: i.name, color: i.color, description: i.description, hidden: i.hidden, archived: false, updatedAt: this.now() };
    this.groups.push(g);
    return g;
  }
  async updateGroup(_o: OrganizationId, id: string, p: Partial<Group>) {
    const g = this.groups.find((x) => x.id === id)!;
    Object.assign(g, p, { updatedAt: this.now() });
    return { ...g };
  }
  async listAssignments(_o: OrganizationId, f: { employeeId?: string; unitType?: UnitType; unitId?: string }) {
    return this.asg.filter((a) => (!f.employeeId || a.employeeId === f.employeeId) && (!f.unitType || a.unitType === f.unitType) && (!f.unitId || a.unitId === f.unitId));
  }
  async createAssignment(_o: OrganizationId, i: Omit<Assignment, "id">) {
    const a = { id: this.id("a"), employeeId: i.employeeId, unitType: i.unitType, unitId: i.unitId, validFrom: i.validFrom, validTo: i.validTo };
    this.asg.push(a);
    return a;
  }
  async endAssignment(_o: OrganizationId, id: string, validTo: string) {
    const a = this.asg.find((x) => x.id === id)!;
    a.validTo = validTo;
    return { ...a };
  }
  async employeeExists(_o: OrganizationId, id: string) {
    return this.employees.has(id);
  }
  primary = new Map<string, string | null>([["e1", "loc-porto"], ["e2", null]]);
  async listActiveLocationIds() {
    return ["loc-porto", "loc-braga"];
  }
  async employeeLocationInfo(_o: OrganizationId, id: string) {
    return this.employees.has(id) ? { primaryLocationId: this.primary.get(id) ?? null, hireDate: "2024-01-15" } : null;
  }
  async setPrimaryLocation(_o: OrganizationId, id: string, loc: string) {
    this.primary.set(id, loc);
  }
  async listContacts() {
    return [...this.contacts];
  }
  async upsertContact(_o: OrganizationId, i: Omit<Contact, "updatedAt">) {
    this.contacts = this.contacts.filter((c) => c.role !== i.role);
    const c = { role: i.role, name: i.name, email: i.email, phone: i.phone, updatedAt: this.now() };
    this.contacts.push(c);
    return c;
  }
  async listTermsAcceptances() {
    return [...this.terms];
  }
  async acceptTerms(_o: OrganizationId, i: { version: string; acceptedBy: string; ip: string | null }) {
    const t: TermsAcceptance = { id: this.id("t"), document: "terms_and_dpa", version: i.version, acceptedBy: i.acceptedBy, acceptedAt: this.now(), ip: i.ip };
    this.terms.push(t);
    return t;
  }
}

function setup() {
  const repo = new FakeRepo();
  const events: { action: string; before: unknown; after: unknown }[] = [];
  const uc = new OrgStructureUseCases(repo, { record: async (_o, e) => void events.push(e) }, { current: () => "198.51.100.4" }, async () => "2026-10-11");
  return { repo, uc, events };
}

const G = (code: string, parentId: string | null = null) => ({ parentId, code, name: `Grupo ${code}`, color: "#ED5C32", description: null, hidden: false });

describe("Estrutura — departamentos e grupos", () => {
  test("departamentos com nome único (sem distinguir maiúsculas); arquivar liberta o nome; tudo auditado", async () => {
    const { uc, events } = setup();
    const d = await uc.createDepartment(ORG, " Cozinha ", ACTOR);
    expect(d.name).toBe("Cozinha");
    await expect(uc.createDepartment(ORG, "cozinha", ACTOR)).rejects.toBeInstanceOf(OrgStructureError);
    await uc.updateDepartment(ORG, d.id, { archived: true }, ACTOR);
    await expect(uc.createDepartment(ORG, "Cozinha", ACTOR)).resolves.toBeDefined();
    expect(events.map((e) => e.action)).toEqual(["structure.department.create", "structure.department.archive", "structure.department.create"]);
  });

  test("grupos: código único, cor e descrição validadas, sem ciclos", async () => {
    const { uc } = setup();
    const a = await uc.createGroup(ORG, G("A"), ACTOR);
    const b = await uc.createGroup(ORG, G("B", a.id), ACTOR);
    const c = await uc.createGroup(ORG, G("C", b.id), ACTOR);
    await expect(uc.createGroup(ORG, G("a"), ACTOR)).rejects.toThrow("código");
    await expect(uc.createGroup(ORG, { ...G("D"), color: "laranja" }, ACTOR)).rejects.toThrow("Cor");
    await expect(uc.createGroup(ORG, { ...G("E"), description: "x".repeat(251) }, ACTOR)).rejects.toThrow("250");
    await expect(uc.updateGroup(ORG, a.id, { parentId: c.id }, ACTOR)).rejects.toThrow("dentro de si próprio");
    await expect(uc.updateGroup(ORG, a.id, { archived: true }, ACTOR)).rejects.toThrow("subgrupos");
    expect(wouldCreateCycle([{ id: "x", parentId: null }], "x", "x")).toBe(true);
  });
});

describe("Estrutura — pertenças com vigência", () => {
  test("sem sobreposição na mesma unidade; encurtar a vigência; unidades por data", async () => {
    const { uc } = setup();
    const dep = await uc.createDepartment(ORG, "Sala", ACTOR);
    const grp = await uc.createGroup(ORG, G("T1"), ACTOR);
    const a = await uc.assign(ORG, { employeeId: "e1", unitType: "department", unitId: dep.id, validFrom: "2026-10-01", validTo: null }, ACTOR);
    await uc.assign(ORG, { employeeId: "e1", unitType: "group", unitId: grp.id, validFrom: "2026-10-05", validTo: null }, ACTOR);
    await expect(uc.assign(ORG, { employeeId: "e1", unitType: "department", unitId: dep.id, validFrom: "2026-11-01", validTo: null }, ACTOR)).rejects.toThrow("nesse período");
    await uc.endAssignment(ORG, a.id, "2026-10-31", ACTOR);
    await expect(uc.endAssignment(ORG, a.id, "2026-12-31", ACTOR)).rejects.toThrow("encurtar");

    expect(await uc.unitsOf(ORG, "e1", "2026-10-31")).toMatchObject({ departmentIds: [dep.id], groupIds: [grp.id] });
    expect(await uc.unitsOf(ORG, "e1", "2026-11-01")).toMatchObject({ departmentIds: [], groupIds: [grp.id] });
    expect(await uc.unitsOf(ORG, "e1", "2026-10-02")).toMatchObject({ departmentIds: [dep.id], groupIds: [] });
    expect(await uc.membersOf(ORG, "group", [grp.id], "2026-10-20")).toEqual(["e1"]);
  });

  test("colaborador ou unidade inexistentes → não encontrado; unidade arquivada deixa de contar", async () => {
    const { uc } = setup();
    const dep = await uc.createDepartment(ORG, "Sala", ACTOR);
    await expect(uc.assign(ORG, { employeeId: "zz", unitType: "department", unitId: dep.id, validFrom: "2026-10-01", validTo: null }, ACTOR)).rejects.toBeInstanceOf(OrgStructureNotFound);
    await expect(uc.assign(ORG, { employeeId: "e1", unitType: "department", unitId: "nope", validFrom: "2026-10-01", validTo: null }, ACTOR)).rejects.toBeInstanceOf(OrgStructureNotFound);
    await uc.assign(ORG, { employeeId: "e1", unitType: "department", unitId: dep.id, validFrom: "2026-10-01", validTo: null }, ACTOR);
    await uc.updateDepartment(ORG, dep.id, { archived: true }, ACTOR);
    expect((await uc.unitsOf(ORG, "e1", "2026-10-10")).departmentIds).toEqual([]);
  });
});

describe("Estrutura — contactos e termos", () => {
  test("contacto por função, com e-mail validado e antes/depois auditado", async () => {
    const { uc, events } = setup();
    await uc.setContact(ORG, "billing", { name: "Faturação Demo", email: "faturas@demo.invalid", phone: null }, ACTOR);
    await uc.setContact(ORG, "billing", { name: "Faturação Demo 2", email: null, phone: "+351 000 000 000" }, ACTOR);
    await expect(uc.setContact(ORG, "billing", { name: "X", email: "sem-arroba", phone: null }, ACTOR)).rejects.toThrow("E-mail");
    await expect(uc.setContact(ORG, "ceo" as never, { name: "X", email: null, phone: null }, ACTOR)).rejects.toThrow("Função");
    expect((await uc.listContacts(ORG)).map((c) => c.name)).toEqual(["Faturação Demo 2"]);
    expect(events.at(-1)).toMatchObject({ before: { name: "Faturação Demo" }, after: { name: "Faturação Demo 2" } });
  });

  test("aceitação de termos/DPA com versão, autor, data e IP", async () => {
    const { uc } = setup();
    const t = await uc.acceptTerms(ORG, "2026-10", ACTOR);
    expect(t).toMatchObject({ document: "terms_and_dpa", version: "2026-10", acceptedBy: ACTOR, ip: "198.51.100.4" });
    await expect(uc.acceptTerms(ORG, " ", ACTOR)).rejects.toThrow("Versão");
  });
});

describe("Transferência de centro (CF-2, TK-10)", () => {
  test("TK_10_transferencia_com_data_de_efeito_nao_altera_os_dias_anteriores", async () => {
    const { uc, repo, events } = setup();
    expect(await uc.unitsOf(ORG, "e1", "2026-10-01")).toMatchObject({ locationIds: null }); // sem histórico: vale o principal
    await uc.transfer(ORG, "e1", "loc-braga", "2026-11-01", ACTOR, "Abertura da loja de Braga");
    expect((await uc.unitsOf(ORG, "e1", "2026-10-31")).locationIds).toEqual(["loc-porto"]);
    expect((await uc.unitsOf(ORG, "e1", "2026-11-01")).locationIds).toEqual(["loc-braga"]);
    expect((await uc.unitsOf(ORG, "e1", "2024-02-01")).locationIds).toEqual(["loc-porto"]); // desde a admissão
    expect(repo.primary.get("e1")).toBe("loc-porto"); // data futura: o principal só muda quando chegar
    expect(events.at(-1)).toMatchObject({ action: "structure.employee.transfer", before: { locationId: "loc-porto" }, after: { locationId: "loc-braga", effectiveDate: "2026-11-01" }, reason: "Abertura da loja de Braga" });
  });

  test("transferência com efeito hoje muda o principal; recusa datas anteriores à última mudança, mesmo centro e sem motivo", async () => {
    const { uc, repo } = setup();
    await uc.transfer(ORG, "e1", "loc-braga", "2026-10-11", ACTOR, "mudança");
    expect(repo.primary.get("e1")).toBe("loc-braga");
    await expect(uc.transfer(ORG, "e1", "loc-porto", "2026-10-05", ACTOR, "x")).rejects.toThrow("nessa data ou depois");
    await expect(uc.transfer(ORG, "e1", "loc-braga", "2026-12-01", ACTOR, "x")).rejects.toThrow("já está neste centro");
    await expect(uc.transfer(ORG, "e1", "loc-porto", "2026-12-01", ACTOR, " ")).rejects.toThrow("motivo");
    await expect(uc.transfer(ORG, "e1", "loc-lua", "2026-12-01", ACTOR, "x")).rejects.toThrow("Centro");
    await expect(uc.assign(ORG, { employeeId: "e1", unitType: "location", unitId: "loc-porto", validFrom: "2026-12-01", validTo: null }, ACTOR)).rejects.toThrow("transferência");
  });

  test("CF_2_depois_da_transferencia_aplicam_se_as_regras_do_novo_centro_a_partir_da_data_de_efeito", async () => {
    const { uc } = setup();
    await uc.transfer(ORG, "e1", "loc-braga", "2026-11-01", ACTOR, "mudança");
    const def = SETTING_CATALOG.find((d) => d.key === "time_tracking.tolerance.minutes")!;
    const snap = {
      profiles: [
        { id: "p-porto", domain: "time_tracking" as const, name: "Porto", kind: "segment" as const, archived: false },
        { id: "p-braga", domain: "time_tracking" as const, name: "Braga", kind: "segment" as const, archived: false },
      ],
      targets: [
        { id: "t1", profileId: "p-porto", targetType: "location" as const, targetId: "loc-porto", validFrom: "2026-01-01", validTo: null },
        { id: "t2", profileId: "p-braga", targetType: "location" as const, targetId: "loc-braga", validFrom: "2026-01-01", validTo: null },
      ],
      values: [
        { id: "v1", profileId: "p-porto", key: def.key, value: 10, validFrom: "2026-01-01", createdAt: "a", createdBy: "x", reason: "r" },
        { id: "v2", profileId: "p-braga", key: def.key, value: 5, validFrom: "2026-01-01", createdAt: "a", createdBy: "x", reason: "r" },
      ],
    };
    const at = async (date: string) => {
      const u = await uc.unitsOf(ORG, "e1", date);
      return resolveSetting(def, { employeeId: "e1", locationIds: u.locationIds ?? [], departmentIds: u.departmentIds, groupIds: u.groupIds }, date, snap);
    };
    expect((await at("2026-10-31")).origin.profileName).toBe("Porto");
    expect((await at("2026-11-01")).origin.profileName).toBe("Braga");
  });
});

describe("Desempenho — unidades em memória", () => {
  test("várias pessoas e datas seguidas: uma só leitura; qualquer escrita limpa e a nova pertença vê-se logo", async () => {
    const { uc, repo } = setup();
    const dep = await uc.createDepartment(ORG, "Sala", ACTOR);
    const spy = jest.spyOn(repo, "listAssignments");
    for (const e of ["e1", "e2", "e3"]) for (const d of ["2026-10-01", "2026-10-02"]) await uc.unitsOf(ORG, e, d);
    expect(spy).toHaveBeenCalledTimes(1);
    await uc.assign(ORG, { employeeId: "e2", unitType: "department", unitId: dep.id, validFrom: "2026-10-01", validTo: null }, ACTOR);
    expect(await uc.unitsOf(ORG, "e2", "2026-10-02")).toMatchObject({ departmentIds: [dep.id] });
  });
});
