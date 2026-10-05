Status: open

# Modelos de turno

Entidade Modelo (nome, descrição, Direto/Repartido, horários incl. noturno, local padrão opcional, Ativo/Inativo) reutilizando a forma de horários do WorkShift. CRUD + duplicar + inativar (nunca apagar), auditoria. Escalas & Turnos ganha a aba "Modelos & Automatizações" (lista de modelos + modal "Novo modelo" com pré-visualização). `hr_work_shifts` ganha `template_id`/`automation_id` e `source` template|automation (T1). Teste crítico 1: alterar Modelo não modifica Turnos.
