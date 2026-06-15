import { CashClosing } from "../../domain/entities/cash-closing.js";

function makeClosing(overrides?: Partial<Parameters<typeof CashClosing.create>[0]>): CashClosing {
  return CashClosing.create({
    employeeId: "emp-1",
    employeeName: "Ana Silva",
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
  });
});
