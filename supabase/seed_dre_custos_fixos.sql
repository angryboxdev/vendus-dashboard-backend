-- Seed: custos fixos DRE de fevereiro a dezembro
-- Ajusta o ano abaixo se necessário (ex: 2025, 2026).
-- Idempotente: não duplica linhas se já existir (year, month, descricao).

do $$
declare
  _year smallint := 2026;
  _month smallint;
  _r record;
  _costs jsonb := '[
    {"descricao": "Taxas Bancárias", "valor": 60.76, "valor_sem_iva": 60.76},
    {"descricao": "Spliiit", "valor": 7.29, "valor_sem_iva": 7.29},
    {"descricao": "Creat", "valor": 676.50, "valor_sem_iva": 549.19},
    {"descricao": "Prossegur", "valor": 43.00, "valor_sem_iva": 34.96},
    {"descricao": "Aluguel", "valor": 2400.00, "valor_sem_iva": 2400.00},
    {"descricao": "Endesa", "valor": 247.38, "valor_sem_iva": 201.12},
    {"descricao": "Águas do Porto", "valor": 60.76, "valor_sem_iva": 49.40},
    {"descricao": "Google Workspace", "valor": 20.00, "valor_sem_iva": 20.00},
    {"descricao": "Retenção Aluguel", "valor": 800.00, "valor_sem_iva": 800.00},
    {"descricao": "Contabilidade", "valor": 150.00, "valor_sem_iva": 121.95},
    {"descricao": "Nos", "valor": 20.99, "valor_sem_iva": 17.07},
    {"descricao": "Empréstimo", "valor": 460.00, "valor_sem_iva": 460.00},
    {"descricao": "Ordenado Funcionários", "valor": 2911.27, "valor_sem_iva": 2911.27}
  ]'::jsonb;
begin
  for _month in 2..12 loop
    for _r in select * from jsonb_to_recordset(_costs) as x(descricao text, valor numeric, valor_sem_iva numeric)
    loop
      insert into public.dre_custos_fixos (year, month, descricao, valor, valor_sem_iva)
      select _year, _month, _r.descricao, _r.valor, _r.valor_sem_iva
      where not exists (
        select 1 from public.dre_custos_fixos f
        where f.year = _year and f.month = _month and f.descricao = _r.descricao
      );
    end loop;
  end loop;
end $$;
