# Módulo: documents

**Área:** RH (Base Organizacional / RH antigo) · **Estado (README):** active (2026-10-20) · **Código:** 24 ficheiros, 7 ficheiros de teste

## Objetivo
O motor único de documentos do Hub (Base Organizacional, ticket 03): documentos da Empresa (apólices, certidões, licenças, contratos institucionais) e dos Colaboradores (contrato de trabalho, NIF, …) vivem no mesmo sítio, com as mesmas regras de versões e validade. As categorias são partilhadas e dizem a que dono se aplicam.

## Estado atual
Implementado (README: active). 2026-10-20 (ADR-0040, fase 1, D1): recebeu do RH antigo os documentos de colaborador, a importação de recibos e os documentos do Portal; rotas novas `/api/novo-rh/...` com aliases `/api/hr/*` até à fase 4; auditoria em `document_audit_logs` (migração `20261104100000`, sem histórico antigo).

## Arquitetura
- Código: `src/modules/documents/` (domain, application, adapters); composição: `documents.module.ts`; documentação detalhada: `src/modules/documents/README.md`.
- Endpoints: lista e permissões em `docs/matriz-autorizacao.md` (`/api/company-documents`, categorias, `/api/novo-rh/people/:id/documents*`, `/api/novo-rh/documents/overview`, `/api/novo-rh/payslips/*`, `/api/me/documents*` e os aliases `/api/hr/*`).

## Dependências
Importa portas/tipos de: [access](access.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
- D2 (frontend): o separador Documentos da ficha do Novo RH passa a usar as rotas novas (sai o `HrProvider`).
- Fase 4 da ADR-0040: retirar os aliases `/api/hr/*`.
