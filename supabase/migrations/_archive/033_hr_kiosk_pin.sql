-- Kiosk PIN para registo de ponto por QR code.
-- Hash HMAC-SHA256(HR_KIOSK_HMAC_SECRET, "kiosk-pin:" || pin) guardado em hex.
-- Índice único parcial: permite múltiplos NULL mas garante que cada PIN é único entre funcionários.

ALTER TABLE hr_employees
  ADD COLUMN kiosk_pin_hash text NULL;

CREATE UNIQUE INDEX hr_employees_kiosk_pin_hash_uq
  ON hr_employees (kiosk_pin_hash)
  WHERE kiosk_pin_hash IS NOT NULL;
