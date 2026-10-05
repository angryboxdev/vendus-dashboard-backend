Status: done

# Calendário & Eventos + Feriados

Calendário corporativo único (mês, semana, próximos importantes). Feriados (nacional/municipal/personalizado; empresa ou local; importar PT por ano com preview e dedupe tenant+data+tipo+scope). Eventos empresariais (prioridade, visibilidade) sem efeito laboral. Evoluir `hr_public_holidays` sem quebrar o HolidayReadPort do hr (D6).

## Comments

- 2026-10-06 — Implementado (backend `0af3a8f`, frontend com commit no branch-rh). Feriados na tabela existente (D6), importação PT conferida contra 2024–2027 em produção, eventos com cancelamento lógico. Migração `20261006110000_calendar_holidays_events.sql` **pendente de aplicação manual**.
