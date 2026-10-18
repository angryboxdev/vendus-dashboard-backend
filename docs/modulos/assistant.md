# Módulo: assistant

**Área:** Novo RH · **Estado (README):** active · **Código:** 9 ficheiros, 4 ficheiros de teste

## Objetivo
O Assistente Mezza é um chat (texto ou voz) dentro de Escalas & Turnos. Responde a perguntas sobre a escala ("quem trabalha hoje?", "quem pode substituir a Maria?", "há turnos sem cobertura?") e faz alterações em turnos não publicados ("coloca o João amanhã das 9h às 17h", "preenche a cobertura desta semana") — sempre com as mesmas regras do ecrã.

## Estado atual
Implementado e em produção (Assistente Mezza nas Escalas).

**Funcionalidades relevantes** (`[ramo financeiro]` = commits locais/ramo não integrado em `main`):
- Fornecedor de IA escolhido por variáveis de ambiente (`ASSISTANT_PROVIDER` openai|gemini, `GEMINI_MODEL`, chaves só no Render/.env).

## Arquitetura
- Código: `src/modules/assistant/` (domain, application, adapters); composição: `assistant.module.ts`; documentação detalhada: `src/modules/assistant/README.md`.
- Endpoints: 5 rotas (prefixo definido no controller) — lista e permissões em `docs/matriz-autorizacao.md`.

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
- IA interpreta; o backend valida e executa (ADR-0038).

## Problemas conhecidos
- Guardrails/quotas de IA em WIP no ramo local `assistente-guardrails` (commit 002fe99, não compila; migração 20261030100000 não aplicada) — adiado pelo utilizador.

## Próximos trabalhos
- Retomar guardrails quando autorizado.
