# Módulo: document-distributions

**Área:** Novo RH · **Estado (README):** active · **Código:** 7 ficheiros, 2 ficheiros de teste

## Objetivo
Novo RH → Documentos → Enviar a colaboradores (FE-065): enviar o mesmo documento (normas de segurança de uma obra, regulamento interno, …) a muitos trabalhadores de uma vez, com confirmação de leitura quando é preciso.

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/document-distributions/` (domain, application, adapters); composição: `document-distributions.module.ts`; documentação detalhada: `src/modules/document-distributions/README.md`.
- Endpoints: 10 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
