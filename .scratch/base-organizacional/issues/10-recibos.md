Status: done

# Recibos de vencimento + importação em massa

Categoria 'Recibo de vencimento' com período (mês/ano); importação de vários PDFs com preview e identificação (nome normalizado, NIF, ficheiro, texto via pdf-parse sem OCR/IA); ambíguo → Rever; dedupe tenant+employee+category+period com Substituir versão.

## Notas

- 2026-10-05 — Implementado (backend `d75a37d`, frontend `00dec9b`, ambos no branch-rh). Categoria periódica `recibo_vencimento` com `period` YYYY-MM; duplicado por colaborador × período bloqueado com "Substituir versão"; importação em massa só admin, identificação por NIF/id/nome/nome do ficheiro (pdf-parse, sem OCR/IA), ambíguo → Rever. Migração `20261006120000_payslips_period.sql` **pendente de aplicação manual** (documento para o Raul: Desktop `Migracoes_Raul_Recibos.docx`, junto com as 2 do 09 e 04–05).
