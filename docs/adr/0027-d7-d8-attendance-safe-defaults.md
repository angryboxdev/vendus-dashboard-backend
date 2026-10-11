# D7/D8: attendance starts with location off and incident hours pending

Taken with the recommended (safest) option on 2026-10-11, under the user's
standing instruction to follow the recommendation without asking.

- **D7 — geolocation, photo, biometrics:** off by default. The geofence rule
  exists (`time_tracking.geofence.require_coordinates` and `block_outside`,
  radius from the centre) but stays disabled until a DPIA is approved; photo
  and biometric terminals are out of scope. Coordinates are only stored when
  the setting asks for them and only at the moment of the punch (no tracking).
- **D8 — incident hours:** pending until approval (Configurações C10 #4).
  Hours of a forgotten/auto-closed record do not count as worked until a
  manager validates the incident (validate requires a comment); a setting
  can change this per segment.
- **Kiosk/NFC/QR for the Novo RH:** the methods setting exists with the "at
  least one active" rule (CF-4); the new punch endpoint covers web/PWA. The
  current kiosk keeps writing to the current HR until the Novo RH replaces it.
- **Recalculation:** synchronous for the punching employee's days, plus a
  queue processed in the background (`setImmediate`) for revisions and
  configuration changes; each `attendance_day` row is a version that stores
  the hash of the configuration and plan used (TK-13).

## Consequences

- RE-13/CF-11 are covered by tests with the rule enabled; production has it
  off until the DPO decides.
- Phase 6 (hour bank) reads the adjustment movements written here.
