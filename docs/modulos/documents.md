# Módulo: documents

**Área:** RH (Base Organizacional / RH antigo) · **Estado (README):** active (2026-10-06) · **Código:** 24 ficheiros, 7 ficheiros de teste

## Objetivo
O motor único de documentos do Hub (Base Organizacional, ticket 03): documentos da Empresa (apólices, certidões, licenças, contratos institucionais) e dos Colaboradores (contrato de trabalho, NIF, …) vivem no mesmo sítio, com as mesmas regras de versões e validade. As categorias são partilhadas e dizem a que dono se aplicam.

## Estado atual
Implementado (README: active). Sem trabalho em curso registado.

## Arquitetura
- Código: `src/modules/documents/` (domain, application, adapters); composição: `documents.module.ts`; documentação detalhada: `src/modules/documents/README.md`.
- Endpoints: 6 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Importa portas/tipos de: [access](access.md).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
