# 04 — Estrutura: departamentos, grupos, pertenças, contactos, termos

Status: resolved
Blocked by: 03

Departamentos (nome único por tenant, arquivar), grupos hierárquicos (código, cor, descrição ≤250, oculto, sem ciclos), pertença colaborador↔departamento/grupo com vigência, contactos por função (C3.11), registo de aceitação de termos/DPA com data e versão (C3.7). Raio dos centros 10–1000 m validado.

## Comments

2026-10-11 — feito (módulo `src/modules/org-structure`, migração 20261012120000 por aplicar). Settings usa unitsOf/membersOf.
