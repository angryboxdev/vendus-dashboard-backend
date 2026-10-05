import { mintOrganizationId, type OrganizationId } from "../../../../kernel/organization-id.js";
import type { CompanyEvent } from "../../domain/entities/company-event.js";
import type { Holiday } from "../../domain/entities/holiday.js";
import { DuplicateHolidayError, InvalidCalendarLocationError } from "../../domain/errors.js";
import type {
  CalendarAuditLogEntry,
  CalendarAuditLogPort,
  CalendarLocationReadPort,
  CompanyEventRepositoryPort,
  DocumentDeadlineReadPort,
  HolidayRepositoryPort,
} from "../../domain/ports/out/calendar-repositories.port.js";
import type { CalendarViewerRole, DocumentDeadline } from "../../domain/services/calendar-items.service.js";
import {
  CancelCompanyEventUseCase,
  CreateCompanyEventUseCase,
  CreateHolidayUseCase,
  ImportHolidaysUseCase,
  ListCalendarUseCase,
  PreviewHolidayImportUseCase,
} from "../../application/use-cases/calendar.use-cases.js";

const ORG = mintOrganizationId("org-a");
const OTHER = mintOrganizationId("org-b");
const NOW = () => new Date("2026-10-06T10:00:00Z");

class FakeHolidays implements HolidayRepositoryPort {
  readonly byOrg = new Map<string, Holiday[]>();
  private list(o: OrganizationId) {
    if (!this.byOrg.has(o)) this.byOrg.set(o, []);
    return this.byOrg.get(o)!;
  }
  async findInRange(o: OrganizationId, from: string, to: string) {
    return this.list(o).filter((h) => h.date >= from && h.date <= to);
  }
  async findById(o: OrganizationId, id: string) {
    return this.list(o).find((h) => h.id === id) ?? null;
  }
  /** Reproduz o índice único de deduplicação. */
  async insert(o: OrganizationId, h: Holiday) {
    if (this.list(o).some((x) => x.key === h.key)) throw new DuplicateHolidayError(h.date);
    this.list(o).push(h);
  }
  async update(o: OrganizationId, h: Holiday) {
    this.byOrg.set(o, this.list(o).map((x) => (x.id === h.id ? h : x)));
  }
  async delete(o: OrganizationId, id: string) {
    this.byOrg.set(o, this.list(o).filter((x) => x.id !== id));
  }
}

class FakeEvents implements CompanyEventRepositoryPort {
  readonly items: CompanyEvent[] = [];
  async findActiveInRange(_o: OrganizationId, from: string, to: string) {
    return this.items.filter((e) => e.status === "active" && e.toProps().date >= from && e.toProps().date <= to);
  }
  async findById(_o: OrganizationId, id: string) {
    return this.items.find((e) => e.id === id) ?? null;
  }
  async insert(_o: OrganizationId, e: CompanyEvent) {
    this.items.push(e);
  }
  async update(_o: OrganizationId, e: CompanyEvent) {
    const i = this.items.findIndex((x) => x.id === e.id);
    this.items[i] = e;
  }
}

class FakeDeadlines implements DocumentDeadlineReadPort {
  constructor(private readonly deadlines: DocumentDeadline[] = []) {}
  async findInRange(_o: OrganizationId, from: string, to: string, _r: CalendarViewerRole) {
    return this.deadlines.filter((d) => d.expiresAt >= from && d.expiresAt <= to);
  }
}

const locations: CalendarLocationReadPort = {
  async findAll() {
    return [
      { id: "loc-mbs", isActive: true },
      { id: "loc-closed", isActive: false },
    ];
  },
};

class FakeAudit implements CalendarAuditLogPort {
  readonly entries: CalendarAuditLogEntry[] = [];
  async record(e: CalendarAuditLogEntry) {
    this.entries.push(e);
  }
}

let seq = 0;
const newId = () => `id-${++seq}`;

describe("Feriados", () => {
  it("teste crítico 'Feriado importado duas vezes': a segunda importação não duplica", async () => {
    const holidays = new FakeHolidays();
    const audit = new FakeAudit();
    const importer = new ImportHolidaysUseCase(holidays, audit, newId);

    const first = await importer.execute({ organizationId: ORG, actor: "admin", country: "PT", year: 2028 });
    const second = await importer.execute({ organizationId: ORG, actor: "admin", country: "PT", year: 2028 });

    expect(first).toEqual({ created: 13, skipped: 0 });
    expect(second).toEqual({ created: 0, skipped: 13 });
    expect((await holidays.findInRange(ORG, "2028-01-01", "2028-12-31")).length).toBe(13);
  });

  it("a pré-visualização marca os que já existem", async () => {
    const holidays = new FakeHolidays();
    await new CreateHolidayUseCase(holidays, locations, new FakeAudit(), newId).execute({
      organizationId: ORG,
      actor: "admin",
      details: { date: "2028-12-25", name: "Natal", type: "national", locationId: null },
    });

    const rows = await new PreviewHolidayImportUseCase(holidays).execute({ organizationId: ORG, country: "PT", year: 2028 });

    expect(rows.find((r) => r.date === "2028-12-25")?.status).toBe("existing");
    expect(rows.filter((r) => r.status === "new")).toHaveLength(12);
  });

  it("feriado municipal de um Local convive com o da empresa no mesmo dia; repetido é recusado", async () => {
    const holidays = new FakeHolidays();
    const create = new CreateHolidayUseCase(holidays, locations, new FakeAudit(), newId);
    const base = { organizationId: ORG, actor: "admin" };

    await create.execute({ ...base, details: { date: "2026-06-24", name: "S. João", type: "municipal", locationId: null } });
    await create.execute({ ...base, details: { date: "2026-06-24", name: "S. João", type: "municipal", locationId: "loc-mbs" } });
    await expect(
      create.execute({ ...base, details: { date: "2026-06-24", name: "S. João (repetido)", type: "municipal", locationId: "loc-mbs" } }),
    ).rejects.toBeInstanceOf(DuplicateHolidayError);
    await expect(
      create.execute({ ...base, details: { date: "2026-06-25", name: "X", type: "custom", locationId: "loc-closed" } }),
    ).rejects.toBeInstanceOf(InvalidCalendarLocationError);
  });
});

describe("Calendário", () => {
  it("junta feriados, eventos e prazos de documentos (ticket 05) sem misturar organizações", async () => {
    const holidays = new FakeHolidays();
    const events = new FakeEvents();
    const audit = new FakeAudit();
    await new ImportHolidaysUseCase(holidays, audit, newId).execute({ organizationId: ORG, actor: "admin", country: "PT", year: 2026 });
    await new CreateCompanyEventUseCase(events, locations, audit, NOW, newId).execute({
      organizationId: ORG,
      actor: "gestor",
      details: {
        title: "Auditoria",
        date: "2026-10-20",
        allDay: true,
        startTime: null,
        endTime: null,
        description: null,
        category: "audit",
        locationId: "loc-mbs",
        priority: "important",
        responsible: null,
        visibility: "all",
      },
    });
    const deadlines = new FakeDeadlines([{ documentId: "doc-1", category: "apolice", categoryLabel: "Apólice", expiresAt: "2026-10-31" }]);
    const list = new ListCalendarUseCase(holidays, events, deadlines, NOW);

    const october = await list.execute({ organizationId: ORG, viewerRole: "manager", from: "2026-10-01", to: "2026-10-31", filter: {} });
    const otherOrg = await list.execute({ organizationId: OTHER, viewerRole: "manager", from: "2026-10-01", to: "2026-10-31", filter: { kinds: ["holiday"] } });

    expect(october.map((i) => `${i.kind}:${i.date}`)).toEqual(["holiday:2026-10-05", "event:2026-10-20", "deadline:2026-10-31"]);
    expect(otherOrg).toEqual([]);
  });

  it("evento cancelado sai do calendário mas continua guardado (nunca apagado)", async () => {
    const events = new FakeEvents();
    const audit = new FakeAudit();
    const created = await new CreateCompanyEventUseCase(events, locations, audit, NOW, newId).execute({
      organizationId: ORG,
      actor: "gestor",
      details: {
        title: "Formação",
        date: "2026-10-22",
        allDay: true,
        startTime: null,
        endTime: null,
        description: null,
        category: "training",
        locationId: null,
        priority: "normal",
        responsible: null,
        visibility: "all",
      },
    });

    await new CancelCompanyEventUseCase(events, audit, NOW).execute({ organizationId: ORG, actor: "gestor", id: created.id });
    const items = await new ListCalendarUseCase(new FakeHolidays(), events, new FakeDeadlines(), NOW).execute({
      organizationId: ORG,
      viewerRole: "admin",
      from: "2026-10-01",
      to: "2026-10-31",
      filter: {},
    });

    expect(items).toEqual([]);
    expect(events.items[0]?.status).toBe("cancelled");
    expect(audit.entries.map((e) => e.action)).toEqual(["create", "cancel"]);
  });
});
