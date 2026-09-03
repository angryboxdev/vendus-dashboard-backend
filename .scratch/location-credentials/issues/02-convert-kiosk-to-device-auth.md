# 02 — Convert kiosk to `requireDeviceAuth`

**What to build:** The kiosk route stops importing `UNATTENDED_SCOPE` directly and
resolves its organization/location scope from `requireDeviceAuth` instead (fallback
to `UNATTENDED_SCOPE` still active per ticket 01 — unpaired screens keep working).
Clock-in and clock-out keep requiring exactly what they require today: a PIN and the
daily rotating token, rate-limited per IP. Nothing about that flow changes — only
where the org/location scope comes from.

This is a mechanical dependency swap at the call site, not new domain logic — no new
controller-level test is expected, matching how kiosk had none before this spec.

Also verify, and record the answer, on the deferred "kiosk PIN collision across
organizations" item: today the kiosk PIN lookup is scoped to `UNATTENDED_SCOPE`'s
organization only because that's "correct by construction while one organization
exists." Once the org/location comes from a real paired token, confirm whether the
PIN lookup — now filtered by the screen's actual paired organization — already
prevents a PIN match against a different organization's employee. If it does, note
that the separately-tracked deferred item can be closed alongside this ticket; if it
doesn't (e.g. the query still needs an explicit scope filter added), fix it here,
since the file is already open for this exact reason.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Kiosk resolves organization/location via `requireDeviceAuth`, not a direct
      `UNATTENDED_SCOPE` import.
- [ ] Clock-in/out still require PIN + daily token, still rate-limited per IP,
      unchanged from today's behavior.
- [ ] A paired screen's kiosk requests resolve to the paired location; an unpaired
      screen's requests still resolve to `UNATTENDED_SCOPE` (fallback path from
      ticket 01).
- [ ] The kiosk PIN-collision deferred item is explicitly checked against the real
      query implementation; the outcome (fixed here, or confirmed already safe once
      scope comes from a real token) is recorded — in this ticket file's Comments, or
      wherever the deferred register itself gets updated.
