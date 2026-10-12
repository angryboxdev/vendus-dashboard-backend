# Module: legal-entities

> Status: active
> Last updated: 2026-10-12

---

## What it is and what it's for (business perspective)

Novo RH → **Entidades legais** (FE-092): as empresas empregadoras do grupo
(ex.: a entidade portuguesa e a espanhola), com os dados fiscais e de
Segurança Social, e a entidade de cada centro (FE-093).

**The problem it solves:**
Com operação em Portugal e Espanha, cada centro e cada contrato pertencem a
uma entidade concreta; sem este registo, as exportações salariais e os
documentos legais não sabem que NIF/NISS usar.

**The flow from the business's point of view:**

```
RH / Administração
──────────────────────────────────────────────
1. Cria a entidade (país, NIF, Segurança Social, morada)
2. Escolhe a entidade de cada centro
3. Edita com motivo; dados fiscais de uma entidade em uso ficam auditados à parte
4. Arquiva quando deixa de ter centros e contratos (nunca apaga)
```

**Key concepts for the business:**

- **Em uso** — tem centros ativos ou contratos em vigor nesses centros.
- **Arquivada** — não aparece nos seletores, mas o histórico fica.

---

## Technical purpose

Dono de `legal_entities` e `legal_entity_locations` (centro → entidade; a
tabela `locations` não muda). Não sabe de contratos: o uso vem do
composition root (`LegalEntitiesContextPort`).

## Domain concepts

- `LegalEntity`, `LegalEntityInput`, `COUNTRIES` (tipos de identificação por país, rótulos de região e Segurança Social).
- `validateLegalEntity` — normaliza e valida (denominação 2–160, NIF por país e tipo, SS 11 dígitos, e-mail, código postal PT `0000-000` / ES `00000`, telefone E.164).
- Dígitos de controlo: `validPtNif` (módulo 11), `validEsNif` (DNI, módulo 23), `validEsNie`, `validEsCif` (letra ou dígito conforme a forma jurídica).

## Ports

### Input (use cases)

- `LegalEntitiesUseCases` — `catalog`, `list` (pesquisa por denominação/NIF, estado), `usage`, `create`, `update` (motivo; não muda de país em uso), `archive` (motivo; 409 com contagens se em uso), `restore`, `locations`, `setLocationEntity` (só entidades ativas).

### Output (domain dependencies)

- `LegalEntitiesRepositoryPort` — sem delete.
- `LegalEntitiesContextPort` — centros ativos, contratos em vigor nesses centros, auditoria.

## Adapters

### Input

- `createLegalEntitiesRouter` → `/api/novo-rh/legal-entities` (`company.structure`): `GET` (`?q&status`), `GET /catalog`, `POST`, `PATCH /:id` (`If-Match` + `reason`), `GET /:id/usage`, `POST /:id/archive`, `POST /:id/restore`, `GET /locations`, `PUT /locations/:locationId`.

### Output

- `SupabaseLegalEntitiesRepository`.

## Design decisions (ADR summary)

- **Nunca apagar** — trigger na BD recusa `delete` em `legal_entities`.
- **NIF único por organização e país** (índice na BD + 409 com `existingId`).
- **Ligação centro → entidade em tabela própria** — não altera a tabela antiga `locations`.
- **Sem reautenticação (step-up) no backend** — o motivo e a auditoria à parte (`legal_entities.update_fiscal_in_use`, com o uso) cobrem a alteração fiscal; step-up fica para quando existir no Novo RH.
- A integração com os formatos de exportação salarial/faturação depende da decisão D10.

## How to test

- `npx jest src/modules/legal-entities` (fakes; teste HTTP do `If-Match`).

## Known gaps / open debt

- Regras de formato por país **a confirmar com a Contabilidade** (a tarefa pede-o): o n.º da SS valida só 11 dígitos, sem dígito de controlo.
- Contratos em uso contados pelo centro principal do colaborador (os contratos ainda não indicam a entidade).
