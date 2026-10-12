import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { TimeBankUseCases } from "../../application/use-cases/time-bank.use-cases.js";
import { cutoff, dayTarget, secondsInCategory, toExpire } from "../../domain/services/posting.js";
import { TimeBankForbiddenError, TimeBankRuleError } from "../../domain/errors.js";
import { DEFAULT_SETTINGS, FakeTimeBankAudit, FakeTimeBankContext, FakeTimeBankRepository } from "../fakes/fake-time-bank.js";

const ORG = mintOrganizationId("org-a");
const BOSS = { userId: "u-boss", email: "gestora@demo.invalid" };
const hms = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;
const fmt = (sec: number) => {
  const sign = sec < 0 ? "-" : "+";
  const a = Math.abs(sec);
  return `${sign}${Math.floor(a / 3600)}h${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}m${String(a % 60).padStart(2, "0")}s`;
};

function setup() {
  const repo = new FakeTimeBankRepository();
  const ctx = new FakeTimeBankContext();
  const uc = new TimeBankUseCases(repo, ctx, new FakeTimeBankAudit());
  return { repo, ctx, uc };
}

describe("Banco de horas — domínio", () => {
  test("corte: a mês vencido e até ontem (D11)", () => {
    expect(cutoff("closed_month", "2026-10-11")).toBe("2026-09-30");
    expect(cutoff("until_yesterday", "2026-10-11")).toBe("2026-10-10");
    expect(cutoff("closed_month", "2026-03-01")).toBe("2026-02-28");
  });

  test("multiplicador 17–18 h × 1,5 dá +30 min (C4.6)", () => {
    const cat = { id: "c", name: "Fim de tarde", validFrom: "2026-01-01", validTo: null, windows: [{ weekdays: ["1", "2", "3", "4", "5"], start: "17:00", end: "18:00" }], factor: 1.5, archived: false };
    // 2026-09-28 (segunda), 09:00–18:00 em Lisboa (UTC+1).
    const day = { workDate: "2026-09-28", workedSeconds: 9 * 3600, excessSeconds: 3600, segments: [{ start: "2026-09-28T08:00:00.000Z", end: "2026-09-28T17:00:00.000Z", type: "work" }] };
    expect(secondsInCategory(day, cat, "Europe/Lisbon")).toBe(3600);
    expect(dayTarget(day, { timeZone: "Europe/Lisbon", validationRequired: false, validation: null, categories: [cat], holiday: null, holidayMode: "leave_days" })).toMatchObject({ base: { kind: "excess", seconds: 3600 }, multiplier: 1800 });
  });

  test("expiração: as mais antigas primeiro; negativas nunca expiram", () => {
    const e = (seconds: number, workDate: string, kind: "excess" | "deficit" | "compensation_rest" = "excess") => ({ id: workDate + seconds, employeeId: "e1", kind, seconds, workDate, postedOn: workDate, paymentMonth: null, reason: "", createdBy: "", createdAt: workDate });
    const entries = [e(7200, "2025-01-10"), e(3600, "2025-02-10"), e(-1800, "2025-03-01", "compensation_rest"), e(5000, "2026-09-01"), e(-9000, "2025-01-15", "deficit")];
    // Antigas (>365 dias): 7200 + 3600 = 10800; consumido: 1800 + 9000 = 10800 → nada expira.
    expect(toExpire(entries, "2026-10-11", 365)).toBe(0);
    expect(toExpire(entries.slice(0, 3), "2026-10-11", 365)).toBe(9000);
    expect(toExpire(entries, "2026-10-11", null)).toBe(0);
  });
});

describe("Banco de horas — casos de uso", () => {
  test("RE_26_ledger_diario_segue_a_sequencia_observada_ate_+4h02m49s", async () => {
    const { uc, ctx } = setup();
    ctx.excess.set("2026-09-24", hms(4, 0, 57));
    ctx.excess.set("2026-09-25", hms(1, 0, 9));
    ctx.excess.set("2026-09-28", -hms(2, 59, 24));
    ctx.excess.set("2026-09-29", hms(2, 0, 53));
    ctx.excess.set("2026-09-30", 14);
    const l = await uc.ledger(ORG, "e1", "sistema");
    const seq = l.entries.filter((e) => e.seconds !== 0).map((e) => [e.workDate, fmt(e.running)]);
    expect(seq).toEqual([
      ["2026-09-24", "+4h00m57s"],
      ["2026-09-25", "+5h01m06s"],
      ["2026-09-28", "+2h01m42s"],
      ["2026-09-29", "+4h02m35s"],
      ["2026-09-30", "+4h02m49s"],
    ]);
    expect(l.balance).toBe(hms(4, 2, 49));
  });

  test("RE_27_a_mes_vencido_a_11_10_so_inclui_ate_30_09", async () => {
    const { uc, ctx } = setup();
    ctx.excess.set("2026-09-30", 3600);
    ctx.excess.set("2026-10-05", 7200);
    const l = await uc.ledger(ORG, "e1", "sistema");
    expect(l.cutoff).toBe("2026-09-30");
    expect(l.available).toBe(3600);
    expect(l.entries.some((e) => e.workDate >= "2026-10-01")).toBe(false);
    ctx.settings = () => ({ ...DEFAULT_SETTINGS, period: "until_yesterday" });
    expect((await uc.ledger(ORG, "e1", "sistema")).available).toBe(3600 + 7200);
  });

  test("RE_28_compensar_9h_com_4h02_e_recusado_com_o_maximo", async () => {
    const { uc, ctx } = setup();
    ctx.excess.set("2026-09-29", hms(4, 2, 49));
    await expect(uc.compensate(ORG, BOSS, "e1", { mode: "rest", seconds: 9 * 3600, paymentMonth: null, reason: "Folga" })).rejects.toMatchObject({ code: "exceeds_balance", details: { availableSeconds: hms(4, 2, 49) } });
    await uc.compensate(ORG, BOSS, "e1", { mode: "rest", seconds: hms(4, 2, 49), paymentMonth: null, reason: "Folga" });
    expect((await uc.ledger(ORG, "e1", "sistema")).balance).toBe(0);
  });

  test("RE_29_correcao_retroativa_gera_ajuste_de_hoje_e_o_historico_nao_muda", async () => {
    const { uc, ctx, repo } = setup();
    ctx.excess.set("2026-09-15", 3600);
    await uc.sync(ORG, "e1", "sistema");
    const before = repo.entries.map((e) => ({ ...e }));
    ctx.excess.set("2026-09-15", 1800); // marcação corrigida
    await uc.sync(ORG, "e1", "sistema");
    expect(repo.entries.slice(0, before.length)).toEqual(before);
    const adj = repo.entries.at(-1)!;
    expect(adj).toMatchObject({ kind: "adjustment", seconds: -1800, workDate: "2026-09-15", postedOn: "2026-10-11", reason: "Correção do dia 2026-09-15" });
    // Voltar a sincronizar sem mudanças não lança nada.
    expect((await uc.sync(ORG, "e1", "sistema")).posted).toBe(0);
  });

  test("CF_6_validacao_ligada_a_01_11_nao_altera_outubro", async () => {
    const { uc, ctx, repo } = setup();
    ctx.today_ = "2026-12-05";
    ctx.excess.set("2026-10-20", 3600);
    ctx.excess.set("2026-11-10", 7200);
    ctx.settings = (d) => ({ ...DEFAULT_SETTINGS, excessValidation: d >= "2026-11-01" });
    const l = await uc.ledger(ORG, "e1", "sistema");
    expect(l.balance).toBe(3600); // outubro entra; novembro espera validação
    expect(l.pendingValidation).toEqual([{ workDate: "2026-11-10", excessSeconds: 7200 }]);
    await expect(uc.decideValidation(ORG, BOSS, "e1", "2026-10-20", "approve", null)).rejects.toMatchObject({ code: "not_required" });
    await uc.decideValidation(ORG, BOSS, "e1", "2026-11-10", "approve", null);
    expect((await uc.ledger(ORG, "e1", "sistema")).balance).toBe(3600 + 7200);
    expect(repo.entries.filter((e) => e.workDate === "2026-11-10").map((e) => e.kind)).toEqual(["excess", "adjustment"]);
  });

  test("validação: recusar exige motivo e ninguém valida o seu próprio excedente", async () => {
    const { uc, ctx } = setup();
    ctx.settings = () => ({ ...DEFAULT_SETTINGS, excessValidation: true });
    await expect(uc.decideValidation(ORG, BOSS, "e1", "2026-09-10", "reject", null)).rejects.toMatchObject({ field: "comment" });
    await expect(uc.decideValidation(ORG, BOSS, "e9", "2026-09-10", "approve", null)).rejects.toBeInstanceOf(TimeBankForbiddenError);
  });

  test("limite anual de horas pagas e compensação além do saldo por política", async () => {
    const { uc, ctx } = setup();
    ctx.excess.set("2026-09-10", 20 * 3600);
    ctx.settings = () => ({ ...DEFAULT_SETTINGS, paidAnnualLimitHours: 10 });
    await uc.compensate(ORG, BOSS, "e1", { mode: "paid", seconds: 8 * 3600, paymentMonth: "2026-10", reason: "Pagamento" });
    await expect(uc.compensate(ORG, BOSS, "e1", { mode: "paid", seconds: 3 * 3600, paymentMonth: "2026-11", reason: "Pagamento" })).rejects.toBeInstanceOf(TimeBankRuleError);
    await expect(uc.compensate(ORG, BOSS, "e1", { mode: "paid", seconds: 3600, paymentMonth: null, reason: "x" })).rejects.toMatchObject({ field: "paymentMonth" });
    ctx.settings = () => ({ ...DEFAULT_SETTINGS, compensateBeyondBalance: true });
    await uc.compensate(ORG, BOSS, "e1", { mode: "rest", seconds: 15 * 3600, paymentMonth: null, reason: "Antecipação" });
    expect((await uc.ledger(ORG, "e1", "sistema")).balance).toBe(-3 * 3600);
  });

  test("feriado trabalhado em modo horas soma trabalhado × (coeficiente − 1)", async () => {
    const { uc, ctx } = setup();
    ctx.excess.set("2026-09-08", 8 * 3600);
    ctx.worked.set("2026-09-08", 8 * 3600);
    ctx.holidays.set("2026-09-08", 2);
    ctx.settings = () => ({ ...DEFAULT_SETTINGS, holidayMode: "hours" });
    const l = await uc.ledger(ORG, "e1", "sistema");
    expect(l.entries.filter((e) => e.workDate === "2026-09-08").map((e) => [e.kind, e.seconds])).toEqual([
      ["excess", 8 * 3600],
      ["holiday", 8 * 3600],
    ]);
  });

  test("ajuste manual com motivo; o próprio não ajusta", async () => {
    const { uc } = setup();
    await expect(uc.adjust(ORG, BOSS, "e1", { seconds: 3600, workDate: null, reason: "" })).rejects.toMatchObject({ field: "reason" });
    await expect(uc.adjust(ORG, BOSS, "e9", { seconds: 3600, workDate: null, reason: "x" })).rejects.toBeInstanceOf(TimeBankForbiddenError);
    const e = await uc.adjust(ORG, BOSS, "e1", { seconds: 3600, workDate: "2026-09-01", reason: "Acordo" });
    expect(e).toMatchObject({ kind: "adjustment", workDate: "2026-09-01", postedOn: "2026-10-11" });
  });

  test("histórico visível ao colaborador só se a regra o permitir", async () => {
    const { uc, ctx } = setup();
    await expect(uc.myLedger(ORG, { userId: "u-emp", email: "e" })).rejects.toMatchObject({ code: "not_visible" });
    ctx.settings = () => ({ ...DEFAULT_SETTINGS, employeeSeesHistory: true });
    await expect(uc.myLedger(ORG, { userId: "u-emp", email: "e" })).resolves.toMatchObject({ employeeId: "e1" });
  });

  test("categorias: nome único e relatório de horas categorizadas", async () => {
    const { uc, ctx } = setup();
    await uc.createCategory(ORG, BOSS, { name: "Noite", validFrom: "2026-01-01", validTo: null, windows: [{ weekdays: ["1"], start: "22:00", end: "06:00" }], factor: null });
    await expect(uc.createCategory(ORG, BOSS, { name: "noite", validFrom: "2026-01-01", validTo: null, windows: [{ weekdays: ["1"], start: "22:00", end: "06:00" }], factor: null })).rejects.toMatchObject({ code: "duplicate_name" });
    ctx.segments.set("2026-09-28", [{ start: "2026-09-28T21:00:00.000Z", end: "2026-09-29T01:00:00.000Z", type: "work" }]);
    const [r] = await uc.categorized(ORG, "e1", "2026-09-28", "2026-09-28");
    expect(r).toMatchObject({ name: "Noite", seconds: 4 * 3600 });
  });

  test("TK_15_propriedade_saldo_igual_a_soma_e_cada_dia_igual_ao_motor", async () => {
    // Gerador determinístico (sem dependências novas): mulberry32.
    let seed = 20261012;
    const rand = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
    for (let run = 0; run < 25; run++) {
      const { uc, ctx, repo } = setup();
      ctx.settings = () => ({ ...DEFAULT_SETTINGS, compensateBeyondBalance: true });
      const dates = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
      for (let step = 0; step < 12; step++) {
        const op = int(0, 2);
        if (op === 0) for (let k = 0; k < int(1, 5); k++) ctx.excess.set(dates[int(0, 29)]!, int(-4 * 3600, 4 * 3600)); // marcações/correções
        if (op === 1) await uc.sync(ORG, "e1", "sistema");
        if (op === 2) await uc.compensate(ORG, BOSS, "e1", { mode: rand() < 0.5 ? "rest" : "paid", seconds: int(1, 3 * 3600), paymentMonth: "2026-10", reason: "teste" });
      }
      await uc.sync(ORG, "e1", "sistema");
      const l = await uc.ledger(ORG, "e1", "sistema");
      // Invariante 1: saldo = soma dos movimentos (e o acumulado final coincide).
      expect(l.balance).toBe(repo.entries.reduce((s, e) => s + e.seconds, 0));
      expect(l.entries.at(-1)?.running ?? 0).toBe(l.balance);
      // Invariante 2: para cada dia, o lançado (diário + ajustes) = o valor atual do motor.
      for (const d of dates) {
        const posted = repo.entries.filter((e) => e.workDate === d && ["excess", "deficit", "adjustment"].includes(e.kind)).reduce((s, e) => s + e.seconds, 0);
        expect(posted).toBe(ctx.excess.get(d) ?? 0);
      }
    }
  });
});
