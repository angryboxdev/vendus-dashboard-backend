Status: done

# Automatizações + geração

Regra guardada: nome, modelo, público (reavaliado em cada geração), local opcional, regra de dias (semanal / diária / período fixo), início, fim opcional, Ativa/Pausada, horizonte (semanas). "Gerar próximas X semanas" + rota cron diária (R5) a gerar só dentro do horizonte; conflitos nunca forçados → "Alertas e ações". Nunca gera para lá do horizonte. Auditoria da geração massiva.

## Notas

- 2026-10-06 — Implementado (backend `e73e765` + `16d95f0`, frontend `0c45ef2`). Migração `20261007120000_hr_shift_automations.sql` **pendente**. Geração só para datas ainda não geradas (`generated_until`), até ao horizonte; só cria válidas; resto em `hr_shift_automation_issues` → Alertas e ações. Cron `POST /api/internal/cron/hr-shift-automations` pronto mas **por agendar no Render** (Raul). Editar não muda modelo/público (cria-se outra automatização). Quem entra no público depois só recebe turnos nas datas ainda por gerar.
