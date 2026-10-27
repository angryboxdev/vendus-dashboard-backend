import { CachingVendusGateway } from "../../adapters/out/caching-vendus.gateway.js";
import type { VendusGatewayPort } from "../../domain/ports/out/vendus-gateway.port.js";
import type { VendusDetailedDocumentRaw } from "../../domain/entities/vendus-document.js";

function fakeInner() {
  const calls: number[] = [];
  const inner: VendusGatewayPort = {
    listDocuments: async () => [],
    fetchDetail: async (id) => {
      calls.push(id);
      return { id, number: `FS 1/${id}` } as unknown as VendusDetailedDocumentRaw;
    },
    listSelfConsumption: async () => ({ records: [], pagesCount: 1 }),
    fetchSelfConsumptionDetail: async () => [],
    listRegisterMovements: async () => [],
  };
  return { inner, calls };
}

describe("CachingVendusGateway", () => {
  it("pede cada documento à Vendus uma só vez", async () => {
    const { inner, calls } = fakeInner();
    const gw = new CachingVendusGateway(inner);
    await gw.fetchDetail(1);
    await gw.fetchDetail(1);
    await gw.fetchDetail(2);
    expect(calls).toEqual([1, 2]);
    expect((await gw.fetchDetail(1)).number).toBe("FS 1/1");
  });

  it("pedidos simultâneos do mesmo documento partilham a ida à Vendus", async () => {
    const { inner, calls } = fakeInner();
    const gw = new CachingVendusGateway(inner);
    await Promise.all([gw.fetchDetail(7), gw.fetchDetail(7), gw.fetchDetail(7)]);
    expect(calls).toEqual([7]);
  });

  it("um erro não fica guardado", async () => {
    let fail = true;
    const { inner } = fakeInner();
    const original = inner.fetchDetail.bind(inner);
    inner.fetchDetail = async (id) => {
      if (fail) throw new Error("Vendus indisponível");
      return original(id);
    };
    const gw = new CachingVendusGateway(inner);
    await expect(gw.fetchDetail(3)).rejects.toThrow("Vendus indisponível");
    fail = false;
    await expect(gw.fetchDetail(3)).resolves.toMatchObject({ id: 3 });
  });

  it("no limite sai o mais antigo", async () => {
    const { inner, calls } = fakeInner();
    const gw = new CachingVendusGateway(inner, 2);
    await gw.fetchDetail(1);
    await gw.fetchDetail(2);
    await gw.fetchDetail(3);
    await gw.fetchDetail(1);
    expect(calls).toEqual([1, 2, 3, 1]);
  });
});
