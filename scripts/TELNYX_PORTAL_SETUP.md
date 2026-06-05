# Telnyx Portal — Outbound Caller ID Setup

Complete this **before** deploying the landline caller ID change to production.

## Goal

- Outbound vet notification calls must use **+353216037774** (Irish landline)
- Stop using **+353863876186** (Irish mobile) for outbound — ComReg compliance

## Steps

1. Log in to [Telnyx Portal](https://portal.telnyx.com)

2. **Numbers → My Numbers**
   - Confirm **+353216037774** is active on the account
   - If missing, purchase or port the number first

3. **Voice → Programmable Voice → Voice API Applications**
   - Open the application whose ID matches `TELNYX_CONNECTION_ID` in production `.env`

4. **Assign the landline to the Voice API Application**
   - Add **+353216037774** as an outbound / caller ID number on that application
   - Ensure the number is linked to the same connection used for `calls.dial`

5. **Remove mobile from outbound (recommended)**
   - Do not use **+353863876186** as the outbound CLI on this Voice API app
   - Retell inbound may still use clinic DIDs separately — that is unrelated to Telnyx outbound

## Verify

After portal setup and VPS deploy, a test escalation log should show:

```
Making outbound notification call to vet via Telnyx {"fromNumber":"+353216037774"}
Telnyx webhook: call.initiated {"from":"+353216037774","to":"..."}
```

If dial fails with a Telnyx error about invalid `from` number, the landline is not yet assigned to the Voice API Application.
