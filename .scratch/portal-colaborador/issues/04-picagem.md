Status: todo
Blocked by: 03

# Picagem Entrada/Saída

`POST /api/me/punches { kind, idempotencyKey, location? }`. Use case no padrão novo (hr): turno elegível (publicado; hoje ou noturno de ontem aberto; janela `pre_shift_window_minutes`), Entrada→Entrada e Saída sem Entrada recusadas, saída no mesmo minuto da entrada tratada sem 500, hora do servidor (Europe/Lisbon). Escreve `hr_shift_attendance` (late/left_early como hoje) + `hr_attendance_punch_events`. Mesma chave → mesmo resultado (retry/duplo toque). Auditoria. O quiosque legado não é alterado.
Testes críticos: duplo clique, retry após timeout, hora do telemóvel errada, sem turno, noturno.
