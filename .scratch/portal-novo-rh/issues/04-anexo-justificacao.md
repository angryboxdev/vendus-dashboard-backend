# Anexo da justificação de falta

Status: open
Fase: 1

Upload pelo colaborador de um ficheiro (PDF/imagem) para anexar a um pedido de ausência (attachmentDocumentId).

## Comments
2026-10-18: o anexo é hoje só um id (`attachmentDocumentId`) sem validação de que existe e pertence ao colaborador. O motor de documentos guarda um documento por categoria (periódicos: um por período), não serve para vários justificativos. Proposta: coluna de anexo no pedido de ausência + ficheiro privado (bucket) carregado pelo colaborador, validado no servidor, com URL assinado para o próprio e aprovadores. Exige migração — aguarda decisão do utilizador.
