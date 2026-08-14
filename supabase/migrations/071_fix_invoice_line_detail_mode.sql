-- Migration 071: corrigir line_detail_mode de faturas com linhas armazenadas
--
-- Antes do conceito de lineDetailMode existir, linhas podiam ser criadas em
-- faturas sem restrição de modo. Essas faturas ficaram com line_detail_mode='simple'
-- (o default), mas têm linhas reais na tabela invoice_lines.
--
-- Com a implementação de SetLineDetailModeUseCase que apaga linhas ao transitar
-- detailed→simple, estas faturas ficariam em risco: qualquer toggle pelo utilizador
-- eliminaria o histórico de linhas silenciosamente.
--
-- Esta migration coloca todas as faturas nessa situação em mode='detailed',
-- tornando as linhas visíveis e consistentes com o estado real da DB.

update invoices
set line_detail_mode = 'detailed'
where line_detail_mode = 'simple'
  and exists (
    select 1
    from invoice_lines
    where invoice_lines.invoice_id = invoices.id
  );
