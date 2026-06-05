# Telnyx Portal — Outbound Caller ID Setup

Complete this **before** deploying outbound vet notification changes to production.

## Goals

1. **Caller ID passthrough** — vet sees the original caller's mobile number on outbound calls
2. **Landline fallback** — `+353216037774` used when Telnyx trunk rejects passthrough CLI
3. **Voice API Application** — numbers assigned to the connection matching `TELNYX_CONNECTION_ID`

## Required: Enable Caller ID Override (passthrough)

For dynamic original-caller CLI on outbound dials:

1. Log in to [Telnyx Portal](https://portal.telnyx.com)
2. Open **Voice → Programmable Voice → Voice API Applications**
3. Select the app matching `TELNYX_CONNECTION_ID`
4. Under **Outbound settings**, enable **Caller ID Override** (allows non-owned numbers as presentation CLI per Telnyx trunk policy)
5. Set **Localization** to **IE** (Ireland) for Irish number validation

See [Telnyx Caller ID Policy](https://developers.telnyx.com/docs/voice/sip-trunking/configuration/caller-id-policy).

Without Caller ID Override, passthrough dials may return `403 Caller Origination Number is Invalid`. The app automatically retries with `TELNYX_FROM_NUMBER` when `TELNYX_CALLER_ID_FALLBACK=true`.

## Assign fallback landline

1. **Numbers → My Numbers** — confirm **+353216037774** is active
2. Assign **+353216037774** to the same Voice API Application as outbound / verified caller ID
3. Stop using **+353863876186** (Irish mobile) as default outbound CLI — ComReg compliance

## Environment (production `.env`)

```env
TELNYX_FROM_NUMBER=+353216037774
TELNYX_CALLER_ID_MODE=passthrough
TELNYX_CALLER_ID_FALLBACK=true
TELNYX_REDIAL_ON_NO_ANSWER=true
TELNYX_DIAL_MAX_ATTEMPTS=2
TELNYX_VOICE=Telnyx.NaturalHD.astra
TELNYX_VOICE_LANGUAGE=en-GB
```

## Verify

After deploy, trigger a test escalation. Logs should show:

```
Escalation queued for case ... until Retell call ... ends
Releasing 1 queued escalation(s) after Retell call ended
Making outbound notification call to vet via Telnyx {"fromNumber":"+35387...","callerIdSource":"passthrough"}
```

If passthrough fails:

```
Telnyx rejected passthrough caller ID — retrying with landline fallback
Making outbound notification call to vet via Telnyx {"fromNumber":"+353216037774","callerIdSource":"landline_fallback"}
```

Vet phone should display the **caller's mobile** when passthrough succeeds, or **021 603 7774** on fallback.
