# Anexo da justificação de falta

Status: resolved
Fase: 1

Upload pelo colaborador de um ficheiro (PDF/imagem) para anexar a um pedido de ausência (attachmentDocumentId).

## Comments
2026-10-18: o anexo é hoje só um id (`attachmentDocumentId`) sem validação de que existe e pertence ao colaborador. O motor de documentos guarda um documento por categoria (periódicos: um por período), não serve para vários justificativos. Proposta: coluna de anexo no pedido de ausência + ficheiro privado (bucket) carregado pelo colaborador, validado no servidor, com URL assinado para o próprio e aprovadores. Exige migração — aguarda decisão do utilizador.

## Answer
Decisão do utilizador: ficheiro no pedido. Migração `20261101110000_absence_request_attachments` (3 colunas nulas em `absence_requests`; validada em PGlite com rollback). `POST /api/me/absence-attachments` (PDF/JPG/PNG/WEBP/HEIC, até 10 MB) guarda em `hr-documents` na pasta `{org}/absence-attachments/{employee}/`; o pedido só aceita caminhos dessa pasta (`ownsAttachment`). Pedido do próprio ignora `attachmentDocumentId` (fecha a falta de validação). Ver: `GET /me/absences/:id/attachment-url` (o próprio), `GET /me/approvals/:id/attachment-url` (aprovador de algum nível), `GET /novo-rh/absences/requests/:id/attachment-url` (gestão no âmbito; ausência privada só com permissão de privadas). Vistas: só nome/tipo, nome «Anexo» quando mascarado, nunca o caminho. Pendente conhecido: o `attachmentDocumentId` atribuído pela gestão continua sem validação de dono.
