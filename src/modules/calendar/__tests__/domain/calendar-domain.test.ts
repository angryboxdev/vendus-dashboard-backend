import { CompanyEvent, type CompanyEventDetails } from "../../domain/entities/company-event.js";
import { Holiday } from "../../domain/entities/holiday.js";
import { InvalidCalendarEntryError } from "../../domain/errors.js";
import {
  deadlinePriority,
  deadlineToItem,
  eventToItem,
  filterCalendarItems,
  holidayToItem,
  upcomingImportant,
} from "../../domain/services/calendar-items.service.js";
import { easterSunday, portugueseNationalHolidays } from "../../domain/services/portuguese-holidays.service.js";

const NOW = new Date("2026-10-06T10:00:00Z");

function eventDetails(overrides: Partial<CompanyEventDetails> = {}): CompanyEventDetails {
  return {
    title: "Auditoria",
    date: "2026-10-20",
    allDay: true,
    startTime: null,
    endTime: null,
    description: null,
    category: "audit",
    locationId: null,
    priority: "important",
    responsible: null,
    visibility: "all",
    ...overrides,
  };
}

describe("feriados nacionais portugueses (D5)", () => {
  it("13 por ano, com os móveis calculados a partir da Páscoa", () => {
    // Datas de 2024–2027 conferidas em 2026-10-06 contra os feriados já carregados em produção.
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    const h2026 = portugueseNationalHolidays(2026);
    expect(h2026).toHaveLength(13);
    expect(h2026).toContainEqual({ date: "2026-04-03", name: "Sexta-feira Santa" });
    expect(h2026).toContainEqual({ date: "2026-06-04", name: "Corpo de Deus" });
    expect(portugueseNationalHolidays(2024)).toContainEqual({ date: "2024-03-29", name: "Sexta-feira Santa" });
    expect(portugueseNationalHolidays(2027)).toContainEqual({ date: "2027-05-27", name: "Corpo de Deus" });
  });
});

describe("Holiday", () => {
  it("valida data, nome e tipo", () => {
    expect(() => Holiday.create("h", { date: "2026-02-30", name: "X", type: "custom", locationId: null })).toThrow(InvalidCalendarEntryError);
    expect(() => Holiday.create("h", { date: "2026-02-10", name: " ", type: "custom", locationId: null })).toThrow(InvalidCalendarEntryError);
  });

  it("a chave de deduplicação distingue tipo e âmbito", () => {
    const company = Holiday.create("a", { date: "2026-06-24", name: "S. João", type: "municipal", locationId: null });
    const local = Holiday.create("b", { date: "2026-06-24", name: "S. João", type: "municipal", locationId: "loc-porto" });
    expect(company.key).not.toBe(local.key);
  });
});

describe("CompanyEvent", () => {
  it("dia inteiro ignora horas; com hora exige início válido e fim depois do início", () => {
    expect(CompanyEvent.create("e", eventDetails({ startTime: "09:00" }), "a", NOW).toProps().startTime).toBeNull();
    expect(() => CompanyEvent.create("e", eventDetails({ allDay: false, startTime: null }), "a", NOW)).toThrow(InvalidCalendarEntryError);
    expect(() => CompanyEvent.create("e", eventDetails({ allDay: false, startTime: "10:00", endTime: "09:00" }), "a", NOW)).toThrow(
      InvalidCalendarEntryError,
    );
  });

  it("cancelado não pode ser alterado", () => {
    const cancelled = CompanyEvent.create("e", eventDetails(), "a", NOW).cancel(NOW);
    expect(() => cancelled.update({ title: "Outro" }, NOW)).toThrow(InvalidCalendarEntryError);
  });
});

describe("calendário único", () => {
  const holiday = holidayToItem(Holiday.create("h", { date: "2026-11-01", name: "Dia de Todos os Santos", type: "national", locationId: null }));
  const localHoliday = holidayToItem(Holiday.create("h2", { date: "2026-06-24", name: "S. João", type: "municipal", locationId: "loc-porto" }));
  const normal = eventToItem(CompanyEvent.create("e1", eventDetails({ title: "Reunião", priority: "normal" }), "a", NOW));
  const critical = eventToItem(CompanyEvent.create("e2", eventDetails({ title: "Renovação seguro", priority: "critical", date: "2026-10-14" }), "a", NOW));
  const managementOnly = eventToItem(CompanyEvent.create("e3", eventDetails({ title: "Reunião gestão", visibility: "management" }), "a", NOW));
  const deadline = deadlineToItem({ documentId: "d1", category: "apolice", categoryLabel: "Apólice", expiresAt: "2026-10-15" }, "2026-10-06");

  it("filtra por tipo, local (inclui empresa inteira) e prioridade", () => {
    const items = [holiday, localHoliday, normal, critical, deadline];
    expect(filterCalendarItems(items, { kinds: ["holiday"] }, "admin").map((i) => i.id)).toEqual(["h2", "h"]);
    expect(filterCalendarItems(items, { locationId: "loc-lisboa" }, "admin").some((i) => i.id === "h2")).toBe(false);
    expect(filterCalendarItems(items, { priority: "critical" }, "admin").map((i) => i.id)).toEqual(["e2", "d1"]);
  });

  it("perfil só-leitura de RH não vê prazos de documentos nem eventos só da gestão", () => {
    const visible = filterCalendarItems([normal, managementOnly, deadline], {}, "hr_viewer").map((i) => i.id);
    expect(visible).toEqual(["e1"]);
  });

  it("próximos importantes: feriados, prazos e eventos importantes/críticos — nunca os normais", () => {
    const list = upcomingImportant(filterCalendarItems([holiday, normal, critical, deadline], {}, "admin"), "2026-10-06", 10);
    expect(list.map((i) => i.id)).toEqual(["e2", "d1", "h"]);
  });

  it("prioridade do prazo pela proximidade", () => {
    expect(deadlinePriority("2026-10-15", "2026-10-06")).toBe("critical");
    expect(deadlinePriority("2026-11-10", "2026-10-06")).toBe("important");
    expect(deadlinePriority("2027-03-01", "2026-10-06")).toBe("normal");
  });
});
