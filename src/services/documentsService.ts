import { vendusGet } from "../infra/vendusClient.js";

/**
 * Busca TODOS os documentos no período (paginação)
 * Observação: Vendus pode retornar array direto
 */
export async function fetchAllDocuments(
  since: string,
  until: string,
  type: string,
  per_page: number
) {
  const all: any[] = [];
  let page = 1;

  while (true) {
    const payload = await vendusGet(
      `/documents/?since=${since}&until=${until}&type=${type}&per_page=${per_page}&page=${page}`
    );

    let items: any[] = [];

    if (Array.isArray(payload)) {
      items = payload;
    } else if (payload && typeof payload === "object") {
      if (Array.isArray((payload as any).data)) {
        items = (payload as any).data;
      } else if (Array.isArray((payload as any).documents)) {
        items = (payload as any).documents;
      }
    }

    all.push(...items);

    if (items.length < per_page) break;

    page += 1;
    if (page > 500) break; // fail-safe
  }

  return { documents: all, pagesFetched: page };
}
