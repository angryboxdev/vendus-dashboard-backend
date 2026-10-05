# Módulo: documents

> Status: active
> Última atualização: 2026-10-05

---

## O que é e para que serve (perspectiva de negócio)

O **motor único de documentos** do Hub (Base Organizacional, ticket 03):
documentos da **Empresa** (apólices, certidões, licenças, contratos
institucionais) e dos **Colaboradores** (contrato de trabalho, NIF, …)
vivem no mesmo sítio, com as mesmas regras de versões e validade. As
categorias são partilhadas e dizem a que dono se aplicam.

**O problema que resolve:**
Antes só existiam documentos de colaborador; a Empresa não tinha onde
guardar a apólice ou a certidão, e uma apólice empresarial aparecia como
"documento em falta" em cada colaborador.

**O fluxo do ponto de vista do negócio:**

```
Gestor/Admin (Empresa & Estrutura → Documentos)     RH (Colaboradores → Documentos)
───────────────────────────────────────────         ──────────────────────────────
1. Envia a apólice (categoria Empresa/Ambos),       Continua igual — os documentos
   com emissão, validade e visibilidade              do colaborador usam o mesmo
2. Renova: nova versão "Atual", a anterior            motor (via módulo `hr`)
   fica "Substituída" (nunca apagada)
3. Consulta o histórico de versões
```

**Key concepts for the business:**

- **Dono** — Empresa (a própria organização) ou um Colaborador.
- **Âmbito da categoria** — Empresa, Colaborador ou Ambos. Uma categoria só
  da Empresa nunca gera "Em falta" num colaborador.
- **Visibilidade** (só documentos da Empresa) — Gestão (gestores e
  administradores) ou Só administração.

---

## Technical purpose

Dono do domínio documental: entidade `Document` (versões, remoção lógica,
validade), `DocumentCategoryDefinition` (âmbito), repositórios sobre
`hr_employee_documents`/`hr_document_categories` (nomes históricos, spec
D9), use cases dos documentos da Empresa e das categorias. **Não** expõe os
documentos de colaborador — continuam no módulo `hr`
(`/api/hr/people/:id/documents`), cujos use cases usam os ports e adapters
daqui (mesmo padrão cross-module de `locations`).

## Domain concepts

- **`Document`** — imutável; `createFirstVersion`, `supersede` (nova versão,
  mesma visibilidade salvo indicação), `markSuperseded` ("Substituído"),
  `remove` (lógico), `belongsTo(owner)`. Dono `{ type: "employee" | "company",
  id }` — para a Empresa o id é o `organizationId`. Visibilidade só existe
  em documentos da Empresa (por defeito `management`).
- **`DocumentCategoryDefinition`** — `scope` (`employee`|`company`|`both`,
  por defeito `employee`); `scopeAllowsOwner`. `jobRoles` usa
  `OperationalCategory` (os 3 valores da antiga "Função"), declarado aqui
  para este módulo nunca depender do `hr`.
- **`computeDocumentDisplayStatus`** (`document-validity.service.ts`) —
  Válido / A expirar (30 dias) / Expirado / A validar / …, igual para os
  dois donos.
- **`canViewCompanyDocument`** — `management`: manager+admin; `admin`: só
  admin; `hr_viewer` nunca vê documentos da Empresa (D11).

## Ports

### Input (use cases)

- Categorias: `ListDocumentCategoriesPort` (filtro opcional por dono),
  `CreateDocumentCategoryPort`, `UpdateDocumentCategoryPort`,
  `SetDocumentCategoryActivePort` (nunca apagar).
- Empresa: `ListCompanyDocumentsPort` (versões atuais visíveis),
  `UploadCompanyDocumentPort` (só categorias Empresa/Ambos; 1 versão atual
  por categoria), `ReplaceCompanyDocumentPort`, `RemoveCompanyDocumentPort`
  (lógico), `GetCompanyDocumentDownloadUrlPort`,
  `GetCompanyDocumentHistoryPort`.

### Output (domain dependencies)

- `DocumentRepositoryPort` — `findById`, `findCurrentByOwners`,
  `findVersionHistory`, `create`, `update` (sem delete).
- `DocumentCategoryRepositoryPort`.
- `DocumentFileStoragePort` — ficheiros da Empresa.
- `DocumentAuditLogPort` — fire-and-forget, `document_audit_logs`.

## Adapters

### Input

- `DocumentCategoriesController` → os mesmos endpoints em
  `/api/hr/document-categories` (rota histórica do ecrã dos Colaboradores)
  e `/api/document-categories`; `?ownerType=employee|company`. GET qualquer
  role; escrita `manager`.
- `CompanyDocumentsController` → `/api/company-documents` (GET, POST
  multipart, `POST /:id/replace`, `DELETE /:id` lógico,
  `GET /:id/download-url`, `GET /:id/history`) — `manager`+.

### Output

- `SupabaseDocumentRepository` → `hr_employee_documents`; Empresa =
  `owner_type='company'` + `employee_id NULL`, dono = `org_id`.
- `SupabaseDocumentCategoryRepository` → `hr_document_categories`.
- `SupabaseDocumentFileStorageAdapter` → bucket `hr-documents`, pasta
  `company/` (prefixo `{org_id}/`).
- `SupabaseDocumentAuditLogAdapter` → `document_audit_logs`.

## Design decisions (ADR summary)

- **Generalizar sem renomear (D9)** — `20261005100000_documents_engine.sql`
  acrescenta `owner_type`, `issued_at`, `visibility` e `scope`; o backend em
  produção e o legacy (`hrDocumentService`) continuam a funcionar antes do
  deploy. O dono "Empresa" não precisa de coluna nova: `employee_id NULL`
  + `org_id`. Uma leitura por `employee_id` (inclusive legacy) nunca devolve
  documentos da Empresa.
- **Documentos de colaborador continuam no `hr`** — existência do
  colaborador, histórico do colaborador (`hr_audit_logs`) e requisitos
  ("Em falta") são conceitos do RH. `applicableCategoriesFor` (no `hr`)
  exclui categorias `company`.
- **"Apólice de seguro de acidentes de trabalho" com âmbito Ambos (D10)** —
  decisão do utilizador; continua opcional nos colaboradores.
- **Auditoria própria (D3)** para documentos da Empresa.
- **Substituir cria a nova versão antes de marcar a anterior** — se a
  escrita falhar a meio, nunca fica sem versão atual.

## How to test

- `npx jest src/modules/documents` (fakes, sem BD).
- Testes críticos da task: tenant isolation e visibilidade
  (`company-documents.test.ts`); documento empresarial nunca "Em falta"
  (`hr/__tests__/use-cases/get-document-overview.test.ts`).

## Known gaps / open debt

- Nomes `hr_employee_documents`/`hr_document_categories`/bucket
  `hr-documents` são históricos (D9) — renomear quando o legacy
  `hrDocumentService` for retirado (ainda apaga fisicamente documentos de
  colaborador na página antiga `/hr/employees/:id`).
- Categorias opcionais continuam a aparecer como "Em falta" (opcional) na
  vista global dos Colaboradores — a tratar no ticket 09.
- Sem teste de integração do adapter generalizado (Supabase local
  indisponível nesta sessão).
