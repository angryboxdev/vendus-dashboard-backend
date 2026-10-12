import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { RemindersUseCases } from "../application/use-cases/reminders.use-cases.js";
import type { RemindersSourcesPort } from "../domain/ports/out/reminders.ports.js";
import { contractNotices, dayNotices, rulesFrom, type ReminderDay, type ReminderRules } from "../domain/services/reminders.service.js";

const ORG = mintOrganizationId("org-a");
const ANA = { id: "e1", name: "Ana Demo" };
const ON: ReminderRules = { missingIn: { enabled: true, minutes: 15 }, openAfterEnd: { enabled: true, minutes: 15 }, probationEnd: { enabled: true, days: 15 }, contractEnd: { enabled: true, days: 30 } };
// Lisboa em outubro = UTC+1 (até 25/10).
const day = (over: Partial<ReminderDay> = {}): ReminderDay => ({ date: "2026-10-12", timeZone: "Europe/Lisbon", plannedStart: "09:00", plannedEnd: "17:00", excused: false, firstInAt: null, openNow: false, ...over });

describe("Avisos automáticos (FE-111)", () => {
  test("entrada em falta: só depois dos minutos configurados e até 4 h depois do início", () => {
    expect(dayNotices(ANA, day(), ON, "2026-10-12T08:10:00Z")).toEqual([]);
    const due = dayNotices(ANA, day(), ON, "2026-10-12T08:16:00Z");
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ kind: "missing_in", dedupeKey: "reminder:missing_in:e1:2026-10-12", to: { employee: true, managers: true } });
    expect(dayNotices(ANA, day(), ON, "2026-10-12T12:30:00Z")).toEqual([]);
    expect(dayNotices(ANA, day({ firstInAt: "2026-10-12T08:05:00Z" }), ON, "2026-10-12T08:20:00Z")).toEqual([]);
    expect(dayNotices(ANA, day({ excused: true }), ON, "2026-10-12T08:20:00Z")).toEqual([]);
    expect(dayNotices(ANA, day(), { ...ON, missingIn: { enabled: false, minutes: 15 } }, "2026-10-12T08:20:00Z")).toEqual([]);
  });

  test("saída por registar: registo aberto depois do fim (incluindo horário que passa a meia-noite)", () => {
    expect(dayNotices(ANA, day({ firstInAt: "x", openNow: true }), ON, "2026-10-12T16:20:00Z").map((n) => n.kind)).toEqual(["open_after_end"]);
    expect(dayNotices(ANA, day({ firstInAt: "x", openNow: true }), ON, "2026-10-12T16:10:00Z")).toEqual([]);
    const night = day({ plannedStart: "22:00", plannedEnd: "06:00", firstInAt: "x", openNow: true });
    expect(dayNotices(ANA, night, ON, "2026-10-12T23:30:00Z")).toEqual([]);
    expect(dayNotices(ANA, night, ON, "2026-10-13T05:20:00Z").map((n) => n.kind)).toEqual(["open_after_end"]);
  });

  test("contratos: avisa dentro da antecedência; só contratos ativos", () => {
    const c = [
      { id: "c1", status: "active", probationEnd: "2026-10-20", endDate: "2026-11-05" },
      { id: "c2", status: "cancelled", probationEnd: "2026-10-15", endDate: null },
    ];
    expect(contractNotices(ANA, c, ON, "2026-10-12").map((n) => n.kind)).toEqual(["probation_end", "contract_end"]);
    expect(contractNotices(ANA, c, { ...ON, contractEnd: { enabled: true, days: 10 } }, "2026-10-12").map((n) => n.kind)).toEqual(["probation_end"]);
  });

  test("regras lidas das configurações; desligadas por omissão", () => {
    expect(rulesFrom([])).toEqual({ missingIn: { enabled: false, minutes: 15 }, openAfterEnd: { enabled: false, minutes: 15 }, probationEnd: { enabled: false, days: 15 }, contractEnd: { enabled: false, days: 30 } });
    expect(rulesFrom([{ key: "notifications.reminder.missing_in.enabled", value: true }, { key: "notifications.reminder.missing_in.minutes", value: 30 }]).missingIn).toEqual({ enabled: true, minutes: 30 });
  });

  test("run: envia a quem deve (colaborador + responsável; contrato → admins) e ignora quem tem tudo desligado", async () => {
    const sent: { users: string[]; key: string }[] = [];
    const sources: RemindersSourcesPort = {
      today: async () => "2026-10-12",
      employees: async () => [ANA, { id: "e2", name: "Rui Demo" }],
      day: async () => day(),
      settings: async (_o, id) =>
        id === "e1"
          ? [
              { key: "notifications.reminder.missing_in.enabled", value: true },
              { key: "notifications.contract.end.enabled", value: true },
            ]
          : [],
      contracts: async () => [{ id: "c1", status: "active", probationEnd: null, endDate: "2026-10-30" }],
      employeeUser: async (_o, id) => (id === "e1" ? "u-ana" : null),
      directManagerUsers: async () => ["u-chefe"],
      adminUsers: async () => ["u-admin"],
    };
    const uc = new RemindersUseCases(sources, { notify: async (_o, users, n) => void sent.push({ users, key: n.dedupeKey }) }, () => "2026-10-12T08:20:00Z");
    const r = await uc.run(ORG);
    expect(r).toMatchObject({ people: 2, notices: 2, byKind: { missing_in: 1, contract_end: 1 } });
    expect(sent).toEqual([
      { users: ["u-ana", "u-chefe"], key: "reminder:missing_in:e1:2026-10-12" },
      { users: ["u-chefe", "u-admin"], key: "contract:end:c1:2026-10-30" },
    ]);
  });
});
