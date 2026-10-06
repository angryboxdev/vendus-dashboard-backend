import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../domain/entities/location.js";
import { InvalidLocationError } from "../../domain/errors.js";
import { SetLocationGeofenceUseCase } from "../../application/use-cases/manage-locations.use-cases.js";
import type { LocationAuditLogEntry, LocationAuditLogPort, LocationAuditLogRecordDTO } from "../../domain/ports/out/location-audit-log.port.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";

const ORG = mintOrganizationId("org-test");
const NOW = new Date("2026-10-06T10:00:00Z");

class FakeAuditLog implements LocationAuditLogPort {
  readonly entries: LocationAuditLogEntry[] = [];
  async record(entry: LocationAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
  async findByEntityId(): Promise<LocationAuditLogRecordDTO[]> {
    return [];
  }
}

function setup() {
  const repository = new FakeLocationRepository();
  const auditLog = new FakeAuditLog();
  const location = Location.create(
    "loc-1",
    { name: "Loja Teste", code: null, address: null, postalCode: null, city: null, municipality: null, country: "PT", timezone: "Europe/Lisbon", phone: null },
    NOW,
  );
  repository.seed(ORG, [location]);
  return { repository, auditLog, useCase: new SetLocationGeofenceUseCase(repository, auditLog, () => NOW) };
}

describe("Zona de picagem do Local (geofence)", () => {
  it("por omissão a política é 'off', sem coordenadas, raio 100 m", () => {
    expect(setup().repository).toBeDefined();
    const loc = Location.reconstitute({ id: "x", name: "X", code: null, timezone: "Europe/Lisbon", isActive: true });
    expect(loc.geofence).toEqual({ latitude: null, longitude: null, radiusM: 100, policy: "off" });
  });

  it("grava coordenadas, raio e política e regista a alteração administrativa no histórico do Local", async () => {
    const { useCase, repository, auditLog } = setup();
    const geofence = { latitude: 41.158, longitude: -8.629, radiusM: 120, policy: "warn" as const };

    const dto = await useCase.execute({ organizationId: ORG, actor: "admin@example.com", locationId: "loc-1", geofence });

    expect(dto.geofence).toEqual(geofence);
    expect((await repository.findOneForOrganization(ORG, "loc-1"))!.geofence).toEqual(geofence);
    expect(auditLog.entries[0]).toMatchObject({ action: "geofence", before: { policy: "off" }, after: geofence });
  });

  it.each([
    [{ latitude: 41.1, longitude: null, radiusM: 100, policy: "off" }, "geofence"],
    [{ latitude: 95, longitude: -8, radiusM: 100, policy: "off" }, "latitude"],
    [{ latitude: 41, longitude: -8, radiusM: 5, policy: "off" }, "radiusM"],
    [{ latitude: null, longitude: null, radiusM: 100, policy: "block" }, "policy"],
  ])("recusa %j", async (geofence, field) => {
    const { useCase } = setup();
    const promise = useCase.execute({ organizationId: ORG, actor: "a", locationId: "loc-1", geofence: geofence as never });
    await expect(promise).rejects.toBeInstanceOf(InvalidLocationError);
    await promise.catch((e: InvalidLocationError) => expect(e.fieldErrors.map((f) => f.field)).toContain(field));
  });
});
