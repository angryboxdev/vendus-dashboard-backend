Status: done

# Documentos dos colaboradores consolidados

Filtros mínimos; categorias com âmbito e obrigatoriedade (todos | cargos selecionados); categorias empresariais nunca geram 'Em falta'; não migrar categorias ambíguas sem revisão.

## Comments

- 2026-10-06 — Implementado (backend `a8ae8e1`, frontend com commit no branch-rh). Obrigatoriedade por Cargo (`position_ids`), opcionais sem documento fora do "Em falta", filtros Estado e Validade. Filtro "Período" fica para o ticket 10 (recibos). Migração `20261006100000_document_categories_positions.sql` **pendente de aplicação manual**.
