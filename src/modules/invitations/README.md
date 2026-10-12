# Module: invitations

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Convites e adesões** (FE-054): o RH cria um código/link de
convite (com centro e departamento opcionais, validade e n.º de
utilizações); o trabalhador abre o link e pede a adesão só com nome,
apelidos e e-mail; o RH aceita — a criação da pessoa abre pré-preenchida —
ou recusa com um motivo interno.

**The problem it solves:**
Recolher os dados de entrada de novos trabalhadores sem os pedir por e-mail
ou papel, e sem criar fichas sem validação do RH.

**The flow from the business's point of view:**

```
RH                                         Trabalhador
──────────────────────────────            ──────────────────────────────
1. Cria o convite (vê o código uma vez)
2. Partilha o link                    →    3. Abre o link, indica nome,
                                              apelidos e e-mail
4. Vê o pedido (aviso se já existe
   ficha com o mesmo e-mail)
5. Aceita → cria a pessoa (assistente
   pré-preenchido) ou recusa com motivo
```

**Key concepts for the business:**

- **Estado do convite** — ativo, expirado, esgotado ou revogado (nunca volta a ativo; cria-se outro).
- **Possível duplicado** — já existe uma ficha com esse e-mail (RE-2).

---

## Technical purpose

Dono de `invitations` e `join_requests`. Não cria fichas: o frontend usa o
assistente de pessoas e depois chama `complete` com o id criado.

## Domain concepts

- `Invitation`, `JoinRequest`, `invitationState`, `validateInvitation` (1–90 dias, 1–500 usos), `validateJoin` (dados mínimos).

## Ports

### Input (use cases)

- `InvitationsUseCases` — `list` (código mascarado), `create` (código completo só aqui), `revoke`, `requests`, `check`/`submit` (públicos), `prefill` (aceitar), `complete`, `reject` (motivo ≥ 5).

### Output (domain dependencies)

- `InvitationsRepositoryPort` (decisões com estado esperado → 409 em concorrência; utilizações por comparar-e-trocar).
- `InvitationCodesPort` (gerar e hash), `InvitationLookupPort` (código → organização), `InvitationsContextPort` (ficha por e-mail, auditoria).

## Adapters

### Input

- `createInvitationsRouters` → `router` em `/api/novo-rh/invitations` (`hr.employees`): `GET`, `POST`, `POST /:id/revoke`, `GET /requests`, `POST /requests/:id/accept|complete|reject`; `publicRouter` (montado antes do `requireAuth`): `GET|POST /api/public/join/:code`, com limite por IP.

### Output

- `SupabaseInvitationsRepository`, `CryptoInvitationCodes` (10 caracteres sem ambíguos, SHA-256 com prefixo), `SupabaseInvitationLookup` (→ `infra/scoped-db/invitation-lookup.ts`).

## Design decisions (ADR summary)

- ADR-0035: porta sem âmbito só para resolver o código; código nunca guardado em claro; mesma resposta para qualquer código inválido; limite por IP.
- Aceitar não cria a pessoa: só fica "aceite" quando o assistente conclui (`complete`); cancelar deixa o pedido pendente.

## How to test

- `npx jest src/modules/invitations` (fakes).

## Known gaps / open debt

- Âmbito por centro (RE-34) não aplicado: quem tem `hr.employees` vê todos os convites e pedidos.
- Retenção/anonimização dos pedidos recusados depende de D4.
- O limite por IP é por instância do servidor.
