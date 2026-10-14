import { MEMO_MAX_AGE_MS, memoizingFetch, requestMemoStats, runWithRequestMemo } from "../request-memo.js";

const URL_A = "https://db.example/rest/v1/org_groups?select=*&org_id=eq.o1";
const URL_B = "https://db.example/rest/v1/org_departments?select=*";

function setup() {
  let t = 0;
  const calls: string[] = [];
  let status = 200;
  const base = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    return new Response(JSON.stringify([{ n: calls.length }]), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const f = memoizingFetch(base, () => t);
  return { f, calls, advance: (ms: number) => (t += ms), fail: (s: number) => (status = s) };
}
const read = async (r: Response) => (await r.json()) as { n: number }[];

describe("request-memo (leituras repetidas num GET)", () => {
  test("fora de um pedido: nada é guardado", async () => {
    const { f, calls } = setup();
    await f(URL_A);
    await f(URL_A);
    expect(calls).toHaveLength(2);
  });

  test("no mesmo pedido: a mesma leitura vai uma vez; cabeçalhos diferentes não se misturam; pedidos diferentes não partilham", async () => {
    const { f, calls } = setup();
    await runWithRequestMemo(async () => {
      const a = await read(await f(URL_A, { headers: { accept: "application/json" } }));
      const b = await read(await f(URL_A, { headers: { accept: "application/json" } }));
      expect(b).toEqual(a);
      await f(URL_A, { headers: { accept: "application/vnd.pgrst.object+json" } });
      await f(URL_B);
      expect(requestMemoStats()).toEqual({ hits: 1, misses: 3 });
    });
    await runWithRequestMemo(async () => void (await f(URL_A, { headers: { accept: "application/json" } })));
    expect(calls).toHaveLength(4);
  });

  test("leituras em paralelo partilham o mesmo pedido à base", async () => {
    const { f, calls } = setup();
    await runWithRequestMemo(() => Promise.all([f(URL_A), f(URL_A), f(URL_A)]));
    expect(calls).toHaveLength(1);
  });

  test("escrever numa tabela apaga o memo só dessa tabela", async () => {
    const { f, calls } = setup();
    await runWithRequestMemo(async () => {
      await f(URL_A);
      await f(URL_B);
      await f("https://db.example/rest/v1/org_groups?id=eq.g1", { method: "PATCH", body: "{}" });
      await f(URL_A);
      await f(URL_B);
    });
    expect(calls.filter((c) => c.startsWith("GET"))).toEqual([`GET ${URL_A}`, `GET ${URL_B}`, `GET ${URL_A}`]);
  });

  test("erros não ficam guardados; entradas velhas (> 30 s) voltam à base; RPC nunca é memorizado", async () => {
    const { f, calls, advance, fail } = setup();
    await runWithRequestMemo(async () => {
      fail(503);
      expect((await f(URL_A)).status).toBe(503);
      fail(200);
      await f(URL_A);
      await f(URL_A);
      advance(MEMO_MAX_AGE_MS + 1);
      await f(URL_A);
      await f("https://db.example/rest/v1/rpc/do_something", { method: "GET" });
      await f("https://db.example/rest/v1/rpc/do_something", { method: "GET" });
    });
    expect(calls).toHaveLength(5);
  });
});
