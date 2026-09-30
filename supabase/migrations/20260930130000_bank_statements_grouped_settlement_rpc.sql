-- Módulo bank-statements — "Liquidação agrupada": um único movimento
-- bancário liquida N documentos (faturas + notas de crédito) do mesmo
-- fornecedor, numa única transação atómica.
--
-- Mesma convenção dos RPCs já existentes no repositório (D17, ADR-0008):
-- `p_org_id` primeiro parâmetro, `security definer`, `search_path` fixo,
-- `select ... for update` para lock de linha, `raise exception '<code>'
-- using errcode = 'P000X'` traduzido pelo adapter para erros de domínio,
-- `grant execute` a todos os roles (RLS diferida por ADR-0007). Ver
-- `20260930100100_stock_purchase_review_rpcs.sql` e
-- `20260930110100_stock_count_rpcs.sql` para os precedentes directos.
--
-- Porque um RPC em vez de N chamadas PostgREST: (1) atomicidade — as N
-- ligações + o estado do movimento + o reconciliation_status de cada fatura
-- afectada têm de ser escritos tudo-ou-nada (secção 20 da tarefa); (2)
-- deteção de "stale document" — cada documento tem o seu saldo em aberto
-- verdadeiro recalculado e comparado ao que o chamador observou, com lock de
-- linha, dentro da mesma transação, nunca numa leitura solta antes do write;
-- (3) idempotência — chamar duas vezes com a mesma selecção ainda válida
-- reescreve o mesmo estado (ver nota "idempotência" abaixo), sem depender de
-- uma coluna de versão nova (este módulo nunca teve nenhuma — ver o README,
-- secção "Liquidação agrupada", para a justificação completa).
--
-- Idempotência sem coluna de versão: o saldo em aberto "verdadeiro" de cada
-- documento é sempre recalculado EXCLUINDO as ligações do próprio movimento
-- (`movement_id <> p_movement_id`) — nunca as suas próprias alocações
-- pendentes de substituição. Isto significa que reenviar a mesma selecção
-- (duplo-clique, refresh, retry de API) recalcula exactamente o mesmo saldo
-- "verdadeiro" que a primeira chamada viu, porque nenhuma DAS OUTRAS
-- alocações mudou — o pedido passa a validação de novo e o delete+insert
-- produz o mesmo estado final. Uma alteração concorrente de outro movimento
-- é que muda o que `movement_id <> p_movement_id` soma, e é isso que faz a
-- comparação falhar.
create or replace function public.fn_reconcile_movement_grouped(
  p_org_id uuid,
  p_movement_id uuid,
  p_entity_links jsonb
)
  returns table (reconciliation_status text)
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_movement_amount integer;
  v_movement_currency text;
  v_movement_booking_date date;
  v_link jsonb;
  v_entity_id uuid;
  v_document_type text;
  v_allocated integer;
  v_expected integer;
  v_row_total integer;
  v_row_currency text;
  v_row_supplier uuid;
  v_row_invoice_number text;
  v_row_supplier_name text;
  v_row_document_type text;
  v_existing_alloc integer;
  v_true_open integer;
  v_distinct_suppliers integer;
  v_total_net integer := 0;
  v_amount_diff integer;
  v_is_partial boolean;
  v_movement_status text;
  v_affected_ids uuid[];
  v_prev_ids uuid[];
  v_id uuid;
  v_final_total integer;
  v_final_alloc integer;
  v_final_status text;
begin
  select amount, currency, booking_date
    into v_movement_amount, v_movement_currency, v_movement_booking_date
  from bank_movements
  where id = p_movement_id and org_id = p_org_id
  for update;

  if v_movement_amount is null then
    raise exception 'movement_not_found' using errcode = 'P0002';
  end if;

  if p_entity_links is null or jsonb_array_length(p_entity_links) = 0 then
    raise exception 'empty_entity_links' using errcode = 'P0006';
  end if;

  -- Documentos previamente ligados a este movimento (vão ser substituídos) —
  -- o respectivo reconciliation_status também é recomputado no fim, mesmo
  -- quando saem da selecção nesta reconciliação (mirror do
  -- ReconcileMovementUseCase: "affected = new ∪ previous").
  select coalesce(array_agg(entity_id), '{}') into v_prev_ids
  from bank_movement_entity_links
  where movement_id = p_movement_id and org_id = p_org_id and entity_type = 'invoice';

  -- ── Passo 1: lock + valida cada documento — nenhuma escrita ainda ────────
  for v_link in select * from jsonb_array_elements(p_entity_links)
  loop
    v_entity_id := (v_link->>'entity_id')::uuid;
    v_document_type := v_link->>'document_type';
    v_allocated := (v_link->>'allocated_amount_cents')::integer;
    v_expected := (v_link->>'expected_open_balance_cents')::integer;

    if v_document_type not in ('invoice', 'credit_note') then
      raise exception 'invalid_document_type:%', v_entity_id using errcode = 'P0007';
    end if;

    -- Fatura → alocação positiva; nota de crédito → alocação negativa
    -- (Invoice.normalizeAmountSign já garante o total da entidade com o
    -- mesmo sinal — nunca invertido aqui).
    if v_document_type = 'invoice' and v_allocated <= 0 then
      raise exception 'invalid_allocation:%', v_entity_id using errcode = 'P0007';
    end if;
    if v_document_type = 'credit_note' and v_allocated >= 0 then
      raise exception 'invalid_allocation:%', v_entity_id using errcode = 'P0007';
    end if;

    select total_with_vat, currency, supplier_id, invoice_number, supplier_name, document_type
      into v_row_total, v_row_currency, v_row_supplier, v_row_invoice_number, v_row_supplier_name, v_row_document_type
    from invoices
    where id = v_entity_id and org_id = p_org_id
    for update;

    if v_row_total is null then
      raise exception 'document_not_found:%', v_entity_id using errcode = 'P0008';
    end if;

    if v_row_document_type <> v_document_type then
      raise exception 'document_type_mismatch:%', v_entity_id using errcode = 'P0007';
    end if;

    if v_row_currency <> v_movement_currency then
      raise exception 'currency_mismatch:%', v_entity_id using errcode = 'P0009';
    end if;

    -- Saldo em aberto verdadeiro: total da entidade menos as alocações de
    -- TODOS OS OUTROS movimentos (nunca as do próprio, que vão ser
    -- substituídas) — ver nota de idempotência no cabeçalho.
    select coalesce(sum(allocated_amount_cents), 0) into v_existing_alloc
    from bank_movement_entity_links
    where org_id = p_org_id and entity_type = 'invoice' and entity_id = v_entity_id
      and movement_id <> p_movement_id;

    v_true_open := v_row_total - v_existing_alloc;

    if v_true_open <> v_expected then
      raise exception 'stale_document:%', v_entity_id using errcode = 'P0001';
    end if;

    if abs(v_allocated) > abs(v_true_open) then
      raise exception 'allocation_exceeds_open_balance:%', v_entity_id using errcode = 'P0007';
    end if;

    v_total_net := v_total_net + v_allocated;
  end loop;

  -- Todos os documentos do lote têm de ser do mesmo fornecedor — validado
  -- aqui como garantia dura do backend, não só como filtro de query no
  -- motor de sugestões (teste #6 da tarefa).
  select count(distinct supplier_id) into v_distinct_suppliers
  from invoices
  where org_id = p_org_id
    and id in (select (value->>'entity_id')::uuid from jsonb_array_elements(p_entity_links));

  if v_distinct_suppliers > 1 then
    raise exception 'mixed_suppliers' using errcode = 'P0007';
  end if;

  -- ── Passo 2: escritas (só chega aqui se TODOS os documentos validaram) ───

  delete from bank_movement_entity_links
  where movement_id = p_movement_id and org_id = p_org_id and entity_type = 'invoice';

  for v_link in select * from jsonb_array_elements(p_entity_links)
  loop
    v_entity_id := (v_link->>'entity_id')::uuid;
    v_allocated := (v_link->>'allocated_amount_cents')::integer;

    select total_with_vat, invoice_number, supplier_name
      into v_row_total, v_row_invoice_number, v_row_supplier_name
    from invoices where id = v_entity_id and org_id = p_org_id;

    insert into bank_movement_entity_links (
      id, org_id, movement_id, entity_type, entity_id, amount_cents, allocated_amount_cents, entity_label
    ) values (
      gen_random_uuid(), p_org_id, p_movement_id, 'invoice', v_entity_id, v_row_total, v_allocated,
      v_row_supplier_name || ' — ' || v_row_invoice_number
    );
  end loop;

  v_amount_diff := v_movement_amount - v_total_net;
  v_is_partial := abs(v_amount_diff) > 100; -- BankMovement.PARTIAL_TOLERANCE_CENTS (1,00€)
  v_movement_status := case when v_is_partial then 'conciliado_parcial' else 'conciliado_com_fatura' end;

  update bank_movements
  set reconciliation_status = v_movement_status,
      justification_type = 'fatura',
      requires_document = true,
      matched_entity_type = null,
      matched_entity_id = null,
      risk_level = 'low',
      confidence_score = null,
      reconciliation_amount_diff = case when v_is_partial then v_amount_diff else null end,
      updated_at = now()
  where id = p_movement_id and org_id = p_org_id;

  -- ── Recomputa reconciliation_status de cada fatura/NC afectada (nova ∪ anterior) ─
  select array(
    select distinct e from unnest(
      v_prev_ids || array(select (value->>'entity_id')::uuid from jsonb_array_elements(p_entity_links))
    ) as e
  ) into v_affected_ids;

  foreach v_id in array v_affected_ids
  loop
    select coalesce(sum(allocated_amount_cents), 0) into v_final_alloc
    from bank_movement_entity_links
    where org_id = p_org_id and entity_type = 'invoice' and entity_id = v_id;

    select total_with_vat into v_final_total from invoices where id = v_id and org_id = p_org_id;

    if v_final_total is null then
      continue; -- documento entretanto eliminado — nada a recomputar
    end if;

    if v_final_alloc = 0 then
      v_final_status := 'pending_reconciliation';
    elsif abs(v_final_alloc) >= abs(v_final_total) - 1 then
      v_final_status := 'reconciled';
    else
      v_final_status := 'partially_reconciled';
    end if;

    if v_final_status = 'reconciled' then
      update invoices
      set reconciliation_status = 'reconciled',
          status = case when status <> 'paid' then 'paid' else status end,
          paid_at = case when status <> 'paid' then v_movement_booking_date else paid_at end
      where id = v_id and org_id = p_org_id;
    else
      update invoices
      set reconciliation_status = v_final_status
      where id = v_id and org_id = p_org_id;
    end if;
  end loop;

  return query select v_movement_status;
end;
$function$;

grant execute on function public.fn_reconcile_movement_grouped(uuid, uuid, jsonb)
  to public, "anon", "authenticated", "postgres", "service_role";
