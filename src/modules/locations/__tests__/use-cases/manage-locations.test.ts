import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location, type LocationDetails } from "../../domain/entities/location.js";
import { DuplicateLocationCodeError, InvalidLocationError, LocationNotFoundError } from "../../domain/errors.js";
import {
  CreateLocationUseCase,
  ListLocationHistoryUseCase,
  SetLocationActiveUseCase,
  UpdateLocationUseCase,
} from "../../application/use-cases/manage-locations.use-cases.js";
import type {
  LocationAuditLogEntry,
  LocationAuditLogPort,
  LocationAuditLogRecordDTO,
} from "../../domain/ports/out/location-audit-log.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";

const ORG = mintOrganizationId("org-a");
const OTHER_ORG = mintOrganizationId("org-b");
const NOW = () => new Date("2026-10-04T10:00:00.000Z");

class FakeLocationAuditLog implements LocationAuditLogPort {
  readonly entries: LocationAuditLogEntry[] = [];
  async record(entry: LocationAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
  async findByEntityId(organizationId: OrganizationId, entityId: string): Promise<LocationAuditLogRecordDTO[]> {
    return this.entries
      .filter((e) => e.organizationId === organizationId && e.entityId === entityId)
      .map((e, i) => ({ id: `a${i}`, createdAt: "", entityType: e.entityType, entityId: e.entityId, action: e.action, actor: e.actor, before: e.before, after: e.after, reason: null }));
  }
}

function details(overrides: Partial<LocationDetails> = {}): LocationDetails {
  return { name: "Loja Centro", code: null, address: null, postalCode: null, city: null, municipality: null, country: "PT", timezone: "Europe/Lisbon", phone: null, ...overrides };
}

function setup() {
  const repository = new FakeLocationRepository();
  const auditLog = new FakeLocationAuditLog();
  repository.seed(ORG, [Location.create("loc-mbs", details({ name: "Mercado", code: "MBS" }), NOW())]);
  return { repository, auditLog };
}

describe("CreateLocationUseCase", () => {
  it("cria um local ativo e audita a criação", async () => {
    const { repository, auditLog } = setup();
    const useCase = new CreateLocationUseCase(repository, auditLog, NOW, () => "loc-new");

    const dto = await useCase.execute({ organizationId: ORG, actor: "admin@exemplo.pt", details: details({ name: "Armazém", code: "arm" }) });

    expect(dto).toMatchObject({ id: "loc-new", name: "Armazém", code: "ARM", isActive: true });
    expect(await repository.findOneForOrganization(ORG, "loc-new")).not.toBeNull();
    expect(auditLog.entries[0]).toMatchObject({ action: "create", entityId: "loc-new" });
  });

  it("recusa código já usado noutro local da mesma organização", async () => {
    const { repository, auditLog } = setup();
    const useCase = new CreateLocationUseCase(repository, auditLog, NOW, () => "loc-new");

    await expect(useCase.execute({ organizationId: ORG, actor: "a", details: details({ code: "mbs" }) })).rejects.toBeInstanceOf(
      DuplicateLocationCodeError,
    );
    expect(auditLog.entries).toHaveLength(0);
  });

  it("o mesmo código pode existir noutra organização", async () => {
    const { repository, auditLog } = setup();
    const useCase = new CreateLocationUseCase(repository, auditLog, NOW, () => "loc-other");

    await expect(useCase.execute({ organizationId: OTHER_ORG, actor: "a", details: details({ code: "MBS" }) })).resolves.toMatchObject({
      code: "MBS",
    });
  });

  it("dados inválidos não gravam", async () => {
    const { repository, auditLog } = setup();
    const useCase = new CreateLocationUseCase(repository, auditLog, NOW, () => "loc-new");

    await expect(useCase.execute({ organizationId: ORG, actor: "a", details: details({ name: "" }) })).rejects.toBeInstanceOf(InvalidLocationError);
    expect(await repository.findOneForOrganization(ORG, "loc-new")).toBeNull();
  });
});

describe("UpdateLocationUseCase", () => {
  it("altera e audita antes/depois", async () => {
    const { repository, auditLog } = setup();

    const dto = await new UpdateLocationUseCase(repository, auditLog, NOW).execute({
      organizationId: ORG,
      actor: "admin@exemplo.pt",
      locationId: "loc-mbs",
      changes: { municipality: "Porto" },
    });

    expect(dto.municipality).toBe("Porto");
    expect(auditLog.entries[0]).toMatchObject({ action: "update" });
  });

  it("manter o próprio código não conta como duplicado", async () => {
    const { repository, auditLog } = setup();
    await expect(
      new UpdateLocationUseCase(repository, auditLog, NOW).execute({ organizationId: ORG, actor: "a", locationId: "loc-mbs", changes: { code: "MBS", city: "Porto" } }),
    ).resolves.toMatchObject({ code: "MBS" });
  });

  it("local de outra organização não é encontrado", async () => {
    const { repository, auditLog } = setup();
    await expect(
      new UpdateLocationUseCase(repository, auditLog, NOW).execute({ organizationId: OTHER_ORG, actor: "a", locationId: "loc-mbs", changes: { city: "X" } }),
    ).rejects.toBeInstanceOf(LocationNotFoundError);
  });
});

describe("SetLocationActiveUseCase", () => {
  it("inativa sem apagar: o local continua a existir e a ser listado", async () => {
    const { repository, auditLog } = setup();

    const dto = await new SetLocationActiveUseCase(repository, auditLog, NOW).execute({
      organizationId: ORG,
      actor: "admin@exemplo.pt",
      locationId: "loc-mbs",
      active: false,
    });

    expect(dto.isActive).toBe(false);
    const all = await repository.findAllForOrganization(ORG);
    expect(all.map((l) => l.id)).toContain("loc-mbs");
    expect(auditLog.entries[0]).toMatchObject({ action: "deactivate", before: { isActive: true }, after: { isActive: false } });
  });

  it("pedir o estado atual não grava nem audita", async () => {
    const { repository, auditLog } = setup();

    await new SetLocationActiveUseCase(repository, auditLog, NOW).execute({ organizationId: ORG, actor: "a", locationId: "loc-mbs", active: true });

    expect(auditLog.entries).toHaveLength(0);
  });
});

describe("ListLocationHistoryUseCase", () => {
  it("devolve o histórico do local e recusa locais de outra organização", async () => {
    const { repository, auditLog } = setup();
    await new SetLocationActiveUseCase(repository, auditLog, NOW).execute({ organizationId: ORG, actor: "a", locationId: "loc-mbs", active: false });
    const useCase = new ListLocationHistoryUseCase(repository, auditLog);

    expect(await useCase.execute({ organizationId: ORG, locationId: "loc-mbs" })).toHaveLength(1);
    await expect(useCase.execute({ organizationId: OTHER_ORG, locationId: "loc-mbs" })).rejects.toBeInstanceOf(LocationNotFoundError);
  });
});
