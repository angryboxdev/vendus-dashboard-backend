Status: done

# Modelos de turno

Entidade Modelo (nome, descrição, Direto/Repartido, horários incl. noturno, local padrão opcional, Ativo/Inativo) reutilizando a forma de horários do WorkShift. CRUD + duplicar + inativar (nunca apagar), auditoria. Escalas & Turnos ganha a aba "Modelos & Automatizações" (lista de modelos + modal "Novo modelo" com pré-visualização). `hr_work_shifts` ganha `template_id`/`automation_id` e `source` template|automation (T1). Teste crítico 1: alterar Modelo não modifica Turnos.

## Notas

- 2026-10-05 — Implementado (backend `87f918c`, frontend no branch-rh). Migração `20261007100000_hr_shift_templates.sql` **pendente de aplicação manual**. As rotações continuam visíveis na nova aba até ao ticket 04.
