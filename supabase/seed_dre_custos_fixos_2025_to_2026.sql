-- Corrige ano: atualiza custos fixos DRE de 2025 para 2026.
-- Executar uma vez no Supabase (SQL Editor) depois de ter corrido seed_dre_custos_fixos.sql com ano 2025.

update public.dre_custos_fixos
set year = 2026
where year = 2025;
