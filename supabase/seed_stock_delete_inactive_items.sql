-- APAGA do stock os itens inativos listados abaixo (nomes exatos da UI).
-- Remove primeiro: movimentos, linhas de receita de pizza e mapeamento Vendus que referenciem esses itens.
-- Só apaga se is_active = false (segurança: se reativaste o item, não remove).
--
-- ATENÇÃO: irreversível. Faz backup se precisares.
-- Executar no Supabase: SQL Editor.

begin;

delete from public.stock_movements
where item_id in (
  select id from public.stock_items
  where is_active = false
    and name in (
      'Molho de tomate Angry Box',
      'Queijo Gorgonzola Casa Leonardi',
      'Queijo Grana Padano Zanetti',
      'Reblochon'
    )
);

delete from public.pizza_recipe_items
where stock_item_id in (
  select id from public.stock_items
  where is_active = false
    and name in (
      'Molho de tomate Angry Box',
      'Queijo Gorgonzola Casa Leonardi',
      'Queijo Grana Padano Zanetti',
      'Reblochon'
    )
);

delete from public.vendus_product_mapping
where stock_item_id in (
  select id from public.stock_items
  where is_active = false
    and name in (
      'Molho de tomate Angry Box',
      'Queijo Gorgonzola Casa Leonardi',
      'Queijo Grana Padano Zanetti',
      'Reblochon'
    )
);

delete from public.stock_items
where is_active = false
  and name in (
    'Molho de tomate Angry Box',
    'Queijo Gorgonzola Casa Leonardi',
    'Queijo Grana Padano Zanetti',
    'Reblochon'
  );

commit;
