# Módulo: reminders

**Área:** Novo RH · **Estado (README):** active · **Código:** 5 ficheiros, 1 ficheiros de teste

## Objetivo
Avisos automáticos do Novo RH (FE-111): o sistema lembra quem precisa, sem ninguém ter de vigiar. - Entrada em falta — X minutos depois do início do horário sem entrada: avisa o colaborador (se tiver conta) e o responsável direto. - Saída por registar — registo ainda aberto X minutos depois do fim do horário: lembra o colaborador. - Fim do período experimental / fim de contrato — X dias antes: avisa o

## Estado atual
Implementado (README: active). Faz parte do Novo RH (fases 0–9 em produção desde 2026-10-12). Decisões humanas pendentes D0–D12: `docs/relatorios/novo-rh-resumo-final.md`.

## Arquitetura
- Código: `src/modules/reminders/` (domain, application, adapters); composição: `reminders.module.ts`; documentação detalhada: `src/modules/reminders/README.md`.
- Sem rotas HTTP próprias declaradas (exposto via outro módulo, cron ou portas internas).

## Dependências
Sem dependências diretas de outros módulos (integrações via portas no composition root / `src/server.ts`).

## Regras de negócio
Ver «Decisões de design» no README do módulo.

## Problemas conhecidos
Ver «Pontos de atenção» no README do módulo.

## Próximos trabalhos
Nenhum registado.
