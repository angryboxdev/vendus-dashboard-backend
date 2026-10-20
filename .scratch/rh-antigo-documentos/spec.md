# RH antigo, fase 1: documentos dos colaboradores fora de `modules/hr`

Estado: **D1 feita** (backend, 2026-10-20, ramo `feat/documentos-novo-rh` → `rh`); D2 e D3 por fazer. ADR-0040, fase 1 (o PIN do quiosque já passou para Pessoas, PR #97/#70).

## Ponto de partida (verificado)
- O motor de documentos já é hexagonal e ativo: `src/modules/documents`.
  - Entidades, portas, `SupabaseDocumentRepository` (`hr_employee_documents`, `owner_type` employee/company), categorias.
  - Bucket `hr-documents`.
- O `modules/hr` (em descontinuação) só tem a camada do colaborador:
  - casos de uso: listar, carregar, substituir, remover, URL de download, histórico, visão geral, revisão, pendentes, «substituir o meu»;
  - importação de recibos (`payslip-import`, `pdf-parse`);
  - serviços de domínio: `document-status`, `document-replacement`, `payslip-identification`, `applicableCategoriesFor`.
  - Depende do RH antigo através de `EmployeeRepositoryPort` (o colaborador existe?) e `HrAuditLogPort` (`hr_audit_logs`).
- Rotas atuais:
  - `/api/hr/people/:id/documents*` → `hr.documents`;
  - `/api/hr/document-overview` → `hr.documents`;
  - `/api/hr/payslips/import*` → `hr.payslip_import`;
  - `/api/me/documents*` → `portal` (`hrModule.meRouter`);
  - `ListPendingDocuments` usado em `/api/hr/requests`.
- Rotas pré-hexagonais `hrRoutes.ts:504-560` + `hrDocumentService.ts` (`/api/hr/employees/:id/documents*`): sem uso aparente no frontend.
- Frontend:
  - O Novo RH só depende do RH antigo em `novo-rh.slots.tsx`: `PersonDocumentsSlot` = `HrProvider` + `EmployeeDocumentsTab`, mais `getEmployeeProfile`.
  - O Portal não importa `modules/hr`; chama `/api/me/documents*`, por isso basta manter os mesmos caminhos.

## Decisões propostas
1. **Destino:** `modules/documents` (backend e frontend). É o dono dos documentos; não se cria módulo novo.
2. **Rotas novas:**
   - `/api/novo-rh/people/:id/documents*`
   - `/api/novo-rh/documents/overview`
   - `/api/novo-rh/payslips/import*`
   - Mesmas permissões e mesmos formatos de resposta.
   - As rotas `/api/hr/*` ficam como **aliases** (mesmo handler) até à fase 4.
3. **`/api/me/documents*`:** mesmos caminhos, servidos pelo router do `documents`. O `meRouter` antigo deixa de os ter. O Portal não muda.
4. **Portas estreitas no `documents`:**
   - `EmployeeLookupPort` (existe? nome; ligado ao repositório de `people`);
   - `ApplicableCategoriesPort` (o serviço puro passa para `documents/domain`);
   - auditoria pela porta de auditoria do Novo RH.
5. **Histórico (decisão do utilizador, 2026-10-20):** o Novo RH começa **sem registo passado**. O histórico dos documentos passa a vir só da auditoria do Novo RH, a partir de agora; `hr_audit_logs` deixa de ser lido. Ficam apenas as informações dos colaboradores que já temos: fichas e os próprios documentos (ficheiros, categorias, estados).
6. **Sem migrações.** Tabelas e bucket ficam iguais.

## Etapas (uma de cada vez, com relatório)
- **D1 — backend, mover sem mudar comportamento.**
  - Casos de uso, portas, serviços e importação de recibos para `modules/documents`.
  - Rotas novas + aliases `/api/hr/*` + `/api/me/documents*` no `documents`.
  - Classificar na matriz.
  - Mover os testes existentes (mesmos casos) e acrescentar testes das portas novas com fakes.
- **D2 — frontend.**
  - `EmployeeDocumentsTab`, entidades e serviços (recibos, aplicabilidade), `ImportPayslipsModal` e `DocumentCategoriesModal` para `modules/documents`, com porta própria a apontar às rotas novas.
  - `novo-rh.slots.tsx` sem `HrProvider`; o perfil vem da API de Pessoas.
  - Visão geral de documentos e importação de recibos acessíveis em `/hr/novo/documentos`.
- **D3 — limpeza.**
  - Apagar `hrRoutes.ts:504-560` e `hrDocumentService.ts` (depois de confirmar nos logs que ninguém os chama).
  - Tirar dos imports antigos o `schedulePdf.ts` → `pages/hr/hr.types`.
- Ordem de deploy: D1 (backend) antes de D2 (frontend). D3 pode ir com D2.

## Riscos
- A importação de recibos depende de `pdf-parse`: mover o adapter sem mudar a versão.
- Os aliases têm de devolver exatamente o mesmo, porque o frontend antigo continua a usá-los até à fase 3.
- Permissões: `requireMinRole("manager")` inline nas escritas tem de ser preservado.

## Como validar
- Ficha do Novo RH → Documentos:
  - carregar, substituir, rever, remover, descarregar, histórico;
  - documentos antigos visíveis.
- Portal: lista, download, substituir.
- Importação de recibos: pré-visualização e importação com PDFs fictícios.
- `GET` pelas rotas antigas e novas devolve o mesmo.
