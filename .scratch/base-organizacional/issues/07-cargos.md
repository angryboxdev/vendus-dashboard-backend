Status: done

# Cargos + migração Função → Cargo

Entidade Cargo (nome, descrição, estado, nº colaboradores; criar/editar/ativar/inativar). Categoria operacional transitória (D4). Migração dos 3 valores atuais sem perda; hr_employees.job_role_id. Cargo ≠ permissão.

## Comments

- 2026-10-04 — Implementado (backend `cc2c012`, frontend `99f1ae6`). Migração `20261004120000_hr_positions_and_employee_locations.sql` **pendente de aplicação manual** (incluída no documento para o Raul).
