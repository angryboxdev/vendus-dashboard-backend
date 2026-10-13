import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { objectStorage } from "../../../../infra/scoped-db/object-storage.js";
import type { PeoplePhotoPort } from "../../domain/ports/out/people.ports.js";

/** Duração dos URLs das fotos (iguais aos da lista do RH antigo). */
const TTL_SECONDS = 60 * 60;

/**
 * Fotos da organização de demonstração: imagens estáticas do frontend
 * (`public/demo-avatars/`), não ficheiros no bucket. Só o gerador da demo
 * grava caminhos com este prefixo; os uploads reais começam pelo id da
 * organização.
 */
export const DEMO_AVATAR_PREFIX = "demo-avatars/";

type BatchSigner = (paths: string[], ttlSeconds: number, org: OrganizationId) => Promise<Map<string, string>>;

/** Fotos das fichas no bucket privado `hr-photos` (URLs assinados, um pedido em lote). */
export class SupabasePeoplePhotoAdapter implements PeoplePhotoPort {
  constructor(private readonly sign: BatchSigner = (paths, ttl, org) => objectStorage.createSignedUrls("hr-photos", paths, ttl, org)) {}

  async urls(org: OrganizationId, paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const stored: string[] = [];
    for (const path of paths) {
      if (path.startsWith(DEMO_AVATAR_PREFIX)) out.set(path, `/${path}`);
      else stored.push(path);
    }
    if (stored.length === 0) return out;
    // Uma falha do armazenamento não deve partir a lista: ficam sem foto.
    try {
      for (const [path, url] of await this.sign(stored, TTL_SECONDS, org)) out.set(path, url);
    } catch {
      /* sem fotos */
    }
    return out;
  }
}
