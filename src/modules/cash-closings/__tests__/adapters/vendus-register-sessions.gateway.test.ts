import { VendusRegisterSessionsGateway } from "../../adapters/out/vendus-register-sessions.gateway.js";
import type {
  VendusGatewayPort,
  VendusRegisterMovement,
  ListDocumentsParams,
} from "../../../vendus/domain/ports/out/vendus-gateway.port.js";
import type { VendusDocument } from "../../../vendus/domain/entities/vendus-document.js";

// ---------- Fake VendusGatewayPort ----------

class FakeVendusGateway implements VendusGatewayPort {
  private movements: VendusRegisterMovement[] = [];
  private documents: VendusDocument[] = [];

  setMovements(movements: VendusRegisterMovement[]): void {
    this.movements = movements;
  }

  setDocuments(documents: VendusDocument[]): void {
    this.documents = documents;
  }

  async listRegisterMovements(_registerId: string, _date: string): Promise<VendusRegisterMovement[]> {
    return this.movements;
  }

  async listDocuments(_params: ListDocumentsParams): Promise<VendusDocument[]> {
    return this.documents;
  }

  fetchDetail(): never { throw new Error("not needed in this test"); }
  listSelfConsumption(): never { throw new Error("not needed in this test"); }
  fetchSelfConsumptionDetail(): never { throw new Error("not needed in this test"); }
}

// ---------- helpers ----------

function mov(
  operation: string,
  time: string,
  amount: string,
  document_id = 0,
): VendusRegisterMovement {
  return { operation, type: "NU", amount, obs: null, document_id, user_id: 1, date: "2026-08-04", time };
}

function makeDoc(id: number, type: string, amount_gross: string): VendusDocument {
  return { id, type, amount_gross } as unknown as VendusDocument;
}

// ---------- testes ----------

describe("VendusRegisterSessionsGateway", () => {
  describe("getSessionsForDate", () => {
    it("devolve lista vazia quando não há movimentos", async () => {
      const gateway = new FakeVendusGateway();
      const sut = new VendusRegisterSessionsGateway("reg-1", gateway);

      const result = await sut.getSessionsForDate("2026-08-04");

      expect(result).toHaveLength(0);
    });

    it("constrói uma sessão completa a partir dos movimentos e documentos", async () => {
      const gateway = new FakeVendusGateway();
      gateway.setMovements([
        mov("open",  "11:00:00", "0"),
        mov("in",    "11:30:00", "100.00", 101),
        mov("in",    "12:00:00", "50.00",  102),
        mov("close", "22:00:00", "0"),
      ]);
      gateway.setDocuments([
        makeDoc(101, "FS", "100.00"),
        makeDoc(102, "FT", "50.00"),
      ]);
      const sut = new VendusRegisterSessionsGateway("reg-1", gateway);

      const result = await sut.getSessionsForDate("2026-08-04");

      expect(result).toHaveLength(1);
      expect(result[0]?.openedAt).toBe("2026-08-04T11:00:00");
      expect(result[0]?.closedAt).toBe("2026-08-04T22:00:00");
      expect(result[0]?.total).toBe(150);
    });

    it("desconta NC dos totais", async () => {
      const gateway = new FakeVendusGateway();
      gateway.setMovements([
        mov("open",  "11:00:00", "0"),
        mov("in",    "11:30:00", "200.00", 101),
        mov("out",   "13:00:00", "30.00",  201),
        mov("close", "22:00:00", "0"),
      ]);
      gateway.setDocuments([
        makeDoc(101, "FS", "200.00"),
        makeDoc(201, "NC", "30.00"),
      ]);
      const sut = new VendusRegisterSessionsGateway("reg-1", gateway);

      const result = await sut.getSessionsForDate("2026-08-04");

      expect(result[0]?.total).toBe(170);
    });

    it("constrói duas sessões (multi-turno)", async () => {
      const gateway = new FakeVendusGateway();
      gateway.setMovements([
        mov("open",  "11:00:00", "0"),
        mov("in",    "11:30:00", "162.37", 101),
        mov("close", "16:00:00", "0"),
        mov("open",  "16:01:00", "0"),
        mov("in",    "17:00:00", "679.13", 102),
        mov("close", "22:00:00", "0"),
      ]);
      gateway.setDocuments([
        makeDoc(101, "FS", "162.37"),
        makeDoc(102, "FT", "679.13"),
      ]);
      const sut = new VendusRegisterSessionsGateway("reg-1", gateway);

      const result = await sut.getSessionsForDate("2026-08-04");

      expect(result).toHaveLength(2);
      expect(result[0]?.total).toBe(162.37);
      expect(result[1]?.total).toBe(679.13);
    });

    it("sessão ainda aberta fica com closedAt null", async () => {
      const gateway = new FakeVendusGateway();
      gateway.setMovements([
        mov("open", "11:00:00", "0"),
        mov("in",   "11:30:00", "100.00", 101),
      ]);
      gateway.setDocuments([makeDoc(101, "FS", "100.00")]);
      const sut = new VendusRegisterSessionsGateway("reg-1", gateway);

      const result = await sut.getSessionsForDate("2026-08-04");

      expect(result[0]?.closedAt).toBeNull();
    });
  });

  describe("getSessionTotal", () => {
    it("devolve o total da sessão identificada por sessionOpenedAt", async () => {
      const gateway = new FakeVendusGateway();
      gateway.setMovements([
        mov("open",  "11:00:00", "0"),
        mov("in",    "11:30:00", "162.37", 101),
        mov("close", "16:00:00", "0"),
        mov("open",  "16:01:00", "0"),
        mov("in",    "17:00:00", "679.13", 102),
        mov("close", "22:00:00", "0"),
      ]);
      gateway.setDocuments([
        makeDoc(101, "FS", "162.37"),
        makeDoc(102, "FT", "679.13"),
      ]);
      const sut = new VendusRegisterSessionsGateway("reg-1", gateway);

      const total = await sut.getSessionTotal("2026-08-04", "2026-08-04T16:01:00");

      expect(total).toBe(679.13);
    });

    it("devolve 0 quando a sessão não existe para o openedAt dado", async () => {
      const gateway = new FakeVendusGateway();
      gateway.setMovements([
        mov("open",  "11:00:00", "0"),
        mov("in",    "11:30:00", "100.00", 101),
        mov("close", "16:00:00", "0"),
      ]);
      gateway.setDocuments([makeDoc(101, "FS", "100.00")]);
      const sut = new VendusRegisterSessionsGateway("reg-1", gateway);

      const total = await sut.getSessionTotal("2026-08-04", "2026-08-04T99:99:99");

      expect(total).toBe(0);
    });
  });
});
