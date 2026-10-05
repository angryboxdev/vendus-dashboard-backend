# Módulo: organization

> Status: active
> Última atualização: 2026-10-04

---

## O que é e para que serve (perspectiva de negócio)

A aba **Empresa** de "Empresa & Estrutura": os dados da entidade legal que
usa o Hub — razão social, NIF, NISS, morada fiscal, contactos, fuso
horário e logotipo.

**O problema que resolve:**
Até aqui a organização só existia com nome/NIF/morada gravados pelo script
de provisioning, sem forma de os completar ou corrigir pela aplicação, e o
logotipo dos PDFs era um ficheiro estático.

**O fluxo do ponto de vista do negócio:**

```
Admin (frontend)
────────────────────────────────────────────────────
1. Abre Empresa & Estrutura → Empresa
2. Completa/corrige razão social, NIF, morada, contactos
3. Grava — erros aparecem por campo (ex.: NIF com dígito errado)
4. Troca o logotipo
5. Consulta o histórico de alterações
```

**Key concepts for the business:**

- **Empresa** — a entidade legal (um NIF). No código é a `Organization`
  já existente (CONTEXT.md), não uma entidade nova.
- **Nome comercial vs Razão social** — o nome pelo qual a empresa é
  conhecida vs o nome legal registado.

---

## Technical purpose

Lê e edita o perfil da linha `organizations` do próprio tenant, guarda o
logotipo num bucket privado e audita as alterações. Não cria nem
desativa organizações (continua a ser o provisioning) e não gere Locais
(módulo `locations`).

## Domain concepts

- **`OrganizationProfile`** — imutável; `update(changes, now)` devolve
  uma nova instância já validada, reportando **todos** os campos
  inválidos de uma vez (`InvalidOrganizationProfileError.fieldErrors`).
  Regras:
  - nome comercial, razão social, NIF e fuso horário obrigatórios (razão
    social só a partir da primeira edição — organizações antigas não a
    têm);
  - se `country = PT`: NIF com dígito de controlo módulo 11, NISS com 11
    dígitos, código postal `NNNN-NNN`; outros países só exigem um valor;
  - website normalizado para `https://…`; email em minúsculas; NIF/NISS
    sem espaços nem pontos.
- `withLogo(path, now)` — troca só o logotipo.

## Ports

### Input (use cases)

- `GetOrganizationProfilePort` — perfil com `logoUrl` assinado (1 h),
  nunca o caminho interno.
- `UpdateOrganizationProfilePort` — alteração parcial + auditoria
  (`update`, antes/depois).
- `UploadOrganizationLogoPort` — guarda o novo ficheiro, nunca apaga o
  anterior + auditoria (`logo_update`).
- `ListOrganizationHistoryPort` — histórico da Empresa.

### Output (domain dependencies)

- `OrganizationProfileRepositoryPort` — `findById`/`save` da linha do
  próprio tenant.
- `OrganizationFileStoragePort` — `store`/`getSignedUrl`.
- `OrganizationAuditLogPort` — fire-and-forget, mirror de
  `StockCountAuditLogPort`.

## Adapters

### Input

- `OrganizationController` → `GET /api/organization` (qualquer role
  autenticado), `PATCH /api/organization`, `POST /api/organization/logo`
  (multipart `file`, jpg/png/webp/svg até 2 MB) e
  `GET /api/organization/history` — estes três com
  `requireMinRole("admin")`. 400 de validação devolve `fieldErrors`.

### Output

- `SupabaseOrganizationProfileRepository` → `organizations` via
  `ScopedQuery` (a tabela usa a própria PK como coluna de organização).
- `SupabaseOrganizationFileStorageAdapter` → bucket privado
  `organization-assets`, caminho `{org_id}/logo/{uuid}/{ficheiro}`.
- `SupabaseOrganizationAuditLogAdapter` → `organization_audit_logs`.

## Design decisions (ADR summary)

- **Empresa = `Organization` existente** (spec D1) — expande-se
  `organizations` (`20261004100000_organization_profile.sql`); `name` é o
  nome comercial e `address` a morada fiscal, sem migração de dados.
  Multiempresa por tenant não está implementado e exigirá ADR, porque
  contradiz a definição atual de Organization (um NIF).
- **Auditoria em tabela própria** (spec D3), como accounting/stock-count —
  `hr_audit_logs` exige `employee_id`.
- **Estado só de leitura** (spec D8) — o `PATCH` ignora `status`;
  ativar/desativar o tenant é assunto de provisioning.
- **Edição só `admin`** — é configuração da organização, como a gestão de
  utilizadores e de tokens de dispositivo.

## How to test

- Domínio/use cases: `npx jest src/modules/organization --testPathIgnorePatterns=integration`.
- Adapters: `npx jest src/modules/organization/__tests__/integration`
  (requer `supabase start` + `supabase db reset`).

## Known gaps / open debt

- O PDF do extrato de fornecedor (`financial-base`,
  `OrganizationIdentityPort`) ainda usa só nome/NIF/morada/email e o
  logotipo estático — passar a usar razão social e o logotipo daqui fica
  para pedido futuro.
- `timezone` da organização ainda não é lido por nenhum módulo (o sistema
  usa `REPORT_TIMEZONE`), tal como o de cada Location.
