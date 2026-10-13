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

type Signer = (path: string, ttlSeconds: number, org: OrganizationId) => Promise<string>;

/** Fotos das fichas no bucket privado `hr-photos` (URLs assinados). */
export class SupabasePeoplePhotoAdapter implements PeoplePhotoPort {
  constructor(private readonly sign: Signer = (path, ttl, org) => objectStorage.createSignedUrl("hr-photos", path, ttl, org)) {}

  async urls(org: OrganizationId, paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    await Promise.all(
      paths.map(async (path) => {
        if (path.startsWith(DEMO_AVATAR_PREFIX)) {
          out.set(path, `/${path}`);
          return;
        }
        // Uma foto em falta no armazenamento não deve partir a lista: fica sem foto.
        try {
          out.set(path, await this.sign(path, TTL_SECONDS, org));
        } catch {
          /* sem foto */
        }
      }),
    );
    return out;
  }
}
