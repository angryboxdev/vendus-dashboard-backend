Status: done

# Aplicar modelo (uma vez) com preview e conflitos

Modal em 3 passos (Configuração → Pré-visualização → Confirmar). Público: um, vários, todos, por Cargo, por Local. Dias: datas específicas, Seg–Sex, fins de semana, personalizado; intervalo. Local: aplicação → modelo → local principal (resolvido no preview). Preview: abrangidos, válidos, duplicados, sobreposições, férias/ausências, feriados (R4, assinalado), inativos; decisões Manter/Substituir (R3)/Ignorar. Confirmação revalida tudo; idempotente (T2); turnos em rascunho (R1). Substitui "Novo Turno Padrão Semanal". Testes críticos 2, 3, 4.

## Notas

- 2026-10-05 — Implementado (backend `6b36d52`, frontend `883f224`). Sem migração nova (usa `hr_shift_templates`/`template_id` do ticket 01). Dívida: dois gestores em simultâneo sobre o mesmo colaborador/dia ainda podem duplicar (sem índice único — dados antigos podem ter repetidos); o caso sequencial (retry, preview desatualizado) está coberto. O "Novo Turno Padrão Semanal" só sai das Escalas no ticket 04.
