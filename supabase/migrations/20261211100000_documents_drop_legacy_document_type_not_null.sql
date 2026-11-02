-- Motor documental (ADR-0040): `document_type` é a coluna do RH antigo
-- (enum contract/id_card/nif/iban/other) e o motor novo nunca a escreve — usa
-- `category`. Como ficou `not null` sem valor por defeito, todos os envios do
-- motor novo (documentos da Empresa, ficha do Novo RH, Portal, recibos)
-- falhavam no insert. Passa a opcional; a check antiga continua válida (null
-- passa) e o ecrã legacy continua a preenchê-la. Idempotente.

alter table public.hr_employee_documents
  alter column document_type drop not null;
