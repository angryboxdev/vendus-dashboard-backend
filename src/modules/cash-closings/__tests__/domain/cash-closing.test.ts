import { CashClosing } from "../../domain/entities/cash-closing.js";

function makeClosing(overrides?: Partial<Parameters<typeof CashClosing.create>[0]>): CashClosing {
  return CashClosing.create({
    employeeId: "emp-1",
    employeeName: "Ana Silva",
    locationId: "loc-1",
    closingDate: "2026-06-10",
    tpa: 200,
    uber: 50,
    glovo: 30,
    bolt: 20,
    eatz: 10,
    cashSales: 100,
    cashIn: 50,
    cashOut: 20,
    cashDrawerOpen: 100,
    cashDrawerTotal: 250,
    vendusTotal: 410,
    notes: null,
    ...overrides,
  });
}

describe("CashClosing entity", () => {
  describe("create", () => {
    it("cria com status pending", () => {
      const c = makeClosing();
      expect(c.status).toBe("pending");
    });

    it("calcula totalCalculated correctamente", () => {
      const c = makeClosing();
      // 200 + 50 + 30 + 20 + 10 + 100 = 410
      expect(c.totalCalculated).toBe(410);
    });

    it("calcula vendusCalculated correctamente (TPA + Eatz + Dinheiro)", () => {
      const c = makeClosing();
      // 200 + 10 + 100 = 310
      expect(c.vendusCalculated).toBe(310);
    });

    it("calcula airMenuCalculated correctamente (Uber + Glovo + Bolt)", () => {
      const c = makeClosing();
      // 50 + 30 + 20 = 100
      expect(c.airMenuCalculated).toBe(100);
    });

    it("vendusCalculated + airMenuCalculated == totalCalculated", () => {
      const c = makeClosing();
      expect(c.vendusCalculated + c.airMenuCalculated).toBe(c.totalCalculated);
    });

    it("calcula sangriaAmount correctamente (gaveta > 100)", () => {
      const c = makeClosing({ cashDrawerTotal: 250 });
      expect(c.sangriaAmount).toBe(150);
    });

    it("sangriaAmount é 0 quando gaveta <= 100", () => {
      const c = makeClosing({ cashDrawerTotal: 80 });
      expect(c.sangriaAmount).toBe(0);
    });

    it("gera um ID único", () => {
      const a = makeClosing();
      const b = makeClosing();
      expect(a.id).not.toBe(b.id);
    });

    it("reviewedAt é null no momento da criação", () => {
      expect(makeClosing().reviewedAt).toBeNull();
    });

    it("managerNotes é null no momento da criação", () => {
      expect(makeClosing().managerNotes).toBeNull();
    });

    it("persiste drawerDenominations quando fornecido", () => {
      const denoms = {
        notes50: 1, notes20: 2, notes10: 0, notes5: 1,
        coins200: 3, coins100: 2, coins50: 1, coins20: 0, coins10: 0, coins1: 5,
      };
      const c = makeClosing({ drawerDenominations: denoms });
      expect(c.drawerDenominations).toEqual(denoms);
    });

    it("drawerDenominations é null quando não fornecido", () => {
      expect(makeClosing().drawerDenominations).toBeNull();
    });
  });

  describe("review", () => {
    it("altera o status e define reviewedAt", () => {
      const c = makeClosing();
      const reviewed = c.review({ status: "approved" });
      expect(reviewed.status).toBe("approved");
      expect(reviewed.reviewedAt).not.toBeNull();
    });

    it("não muda reviewedAt se status não for fornecido", () => {
      const c = makeClosing();
      const patched = c.review({ managerNotes: "ok" });
      expect(patched.reviewedAt).toBeNull();
    });

    it("recalcula totalCalculated ao alterar campo numérico", () => {
      const c = makeClosing({ tpa: 200 });
      const patched = c.review({ tpa: 300 });
      // 300 + 50 + 30 + 20 + 10 + 100 = 510
      expect(patched.totalCalculated).toBe(510);
    });

    it("recalcula sangriaAmount ao alterar cashDrawerTotal", () => {
      const c = makeClosing({ cashDrawerTotal: 150 });
      const patched = c.review({ cashDrawerTotal: 80 });
      expect(patched.sangriaAmount).toBe(0);
    });

    it("não muta a entidade original", () => {
      const c = makeClosing();
      c.review({ status: "approved", tpa: 999 });
      expect(c.status).toBe("pending");
      expect(c.tpa).toBe(200);
    });

    it("actualiza managerNotes", () => {
      const c = makeClosing();
      const patched = c.review({ managerNotes: "confere" });
      expect(patched.managerNotes).toBe("confere");
    });

    it("pode limpar managerNotes para null", () => {
      const c = makeClosing();
      const withNotes = c.review({ managerNotes: "test" });
      const cleared = withNotes.review({ managerNotes: null });
      expect(cleared.managerNotes).toBeNull();
    });

    it("review() não altera drawerDenominations (contagem física imutável)", () => {
      const denoms = {
        notes50: 2, notes20: 1, notes10: 0, notes5: 3,
        coins200: 1, coins100: 4, coins50: 0, coins20: 2, coins10: 1, coins1: 10,
      };
      const c = makeClosing({ drawerDenominations: denoms });
      const reviewed = c.review({ status: "approved", cashDrawerTotal: 300, tpa: 999 });
      expect(reviewed.drawerDenominations).toEqual(denoms);
    });

    it("review() preserva airMenuUber/Glovo/Bolt (imutáveis após submissão)", () => {
      const c = makeClosing({ airMenuUber: 48.20, airMenuGlovo: 30.00, airMenuBolt: 21.50 });
      const reviewed = c.review({ status: "approved", tpa: 999 });
      expect(reviewed.airMenuUber).toBe(48.20);
      expect(reviewed.airMenuGlovo).toBe(30.00);
      expect(reviewed.airMenuBolt).toBe(21.50);
    });

    it("recalcula vendusCalculated ao alterar TPA no review", () => {
      const c = makeClosing({ tpa: 200 });
      const patched = c.review({ tpa: 300 });
      // 300 + 10 + 100 = 410
      expect(patched.vendusCalculated).toBe(410);
    });

    it("recalcula airMenuCalculated ao alterar Uber no review", () => {
      const c = makeClosing({ uber: 50 });
      const patched = c.review({ uber: 80 });
      // 80 + 30 + 20 = 130
      expect(patched.airMenuCalculated).toBe(130);
    });
  });

  describe("campos AirMenu", () => {
    it("persiste airMenuUber/Glovo/Bolt quando fornecidos", () => {
      const c = makeClosing({ airMenuUber: 48.20, airMenuGlovo: 30.00, airMenuBolt: 21.50 });
      expect(c.airMenuUber).toBe(48.20);
      expect(c.airMenuGlovo).toBe(30.00);
      expect(c.airMenuBolt).toBe(21.50);
    });

    it("airMenuUber/Glovo/Bolt são null quando não fornecidos", () => {
      const c = makeClosing();
      expect(c.airMenuUber).toBeNull();
      expect(c.airMenuGlovo).toBeNull();
      expect(c.airMenuBolt).toBeNull();
    });

    it("campos AirMenu não afectam totalCalculated", () => {
      const sem = makeClosing();
      const com = makeClosing({ airMenuUber: 9999, airMenuGlovo: 9999, airMenuBolt: 9999 });
      expect(com.totalCalculated).toBe(sem.totalCalculated);
    });
  });
});
