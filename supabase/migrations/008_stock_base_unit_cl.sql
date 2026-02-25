-- Adicionar unidade 'cl' (centilitro) ao enum para bebidas

alter type public.stock_base_unit add value if not exists 'cl';
