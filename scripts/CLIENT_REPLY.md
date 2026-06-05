# Client Update — Dynamic Outbound Calls (June 2026)

Copy/adapt for the client.

---

Hi,

We have implemented the additional complexity you described:

**1. Outbound call after inbound Retell session ends**

When an urgent case is escalated during a caller conversation, the system now **queues** the vet notification until Retell sends `call_ended`. Only then does it:

- Place the outbound Telnyx call to the on-call vet
- Send the WhatsApp case details

This avoids overlapping the inbound AI call with the outbound vet dial.

**2. Original caller ID via Telnyx outbound**

Outbound vet calls now use **caller ID passthrough** by default: the vet's phone should display the **original caller's mobile number** (the number that dialled the clinic).

This requires **Caller ID Override** enabled on your Telnyx Voice API Application (see our Telnyx portal setup notes). If Telnyx rejects the passthrough number (trunk policy / validation), the system **automatically falls back** to your Irish landline **+353216037774** so the call still completes.

**3. Telnyx trunk retry / failover**

- If passthrough CLI is rejected at dial time → immediate redial with landline fallback
- If the vet call ends without answer (busy / no answer) → one automatic redial attempt
- WhatsApp failover timer (15 min) and backup-vet escalation unchanged for no WhatsApp response

**Telnyx portal action required**

Please enable **Caller ID Override** on your Voice API Application and assign **+353216037774** as the verified fallback number. Without this, passthrough may not work and calls will use the landline only.

We will run an end-to-end test after deployment and confirm the vet sees the caller's number when the inbound call ends.

Best regards,
Theo
