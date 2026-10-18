# Módulo: google-reviews

**Área:** Novo RH · **Estado (README):** active · **Código:** 8 ficheiros, 1 ficheiros de teste

## Objetivo
Mostra no Dashboard do Novo RH a nota Google de cada local (estrelas e número de avaliações), a média ponderada da empresa e, a pedido, as avaliações mais recentes de um local com link para o Google.

## Estado atual
Implementado e em produção (notas Google por local no Dashboard).

## Arquitetura
- Código: `src/modules/google-reviews/` (domain, application, adapters); composição: `google-reviews.module.ts`; documentação detalhada: `src/modules/google-reviews/README.md`.
- Endpoints: 4 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
- Chave da API só em variáveis de ambiente.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
