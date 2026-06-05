# Client Update — Outbound Calls & WhatsApp (June 2026)

Copy/adapt this message for the client.

---

Hi,

Thanks for the test feedback. Here is what we found and what we have changed:

**1. Caller ID on outbound vet calls**

The system cannot show the original caller's mobile number on outbound calls to vets. That is not supported by our Telnyx setup, and Irish telecom rules (ComReg CLI regulations) require the displayed number to be a number legitimately assigned to the calling service — not the pet owner's personal mobile.

We have switched the outbound caller ID to your Irish landline **+353216037774**, as requested. Vet notification calls will now display this landline instead of the previous Telnyx mobile number (+353863876186). This is the correct and compliant approach for outbound calls in Ireland.

**2. WhatsApp message failure (first test)**

The first-test failure (`detached Frame` error) was a transient issue with our WhatsApp automation browser session — it tried to send before WhatsApp Web had fully stabilised after a reconnect. We have added:

- Automatic retries when this happens
- A short wait until WhatsApp reports fully connected before accepting sends
- An extra retry at escalation level if the first send attempt still fails

Your second test completed successfully (call + WhatsApp + vet reply), which confirms the core flow is working.

**3. More realistic voice on outbound calls**

We upgraded the outbound notification voice from basic Telnyx TTS to **Telnyx NaturalHD** (British English). It should sound noticeably more natural on the "check your WhatsApp" call to the vet. If you would like a different tone, we can try other NaturalHD voices or ElevenLabs via Telnyx.

**Next step**

We will run one more end-to-end test after deployment and confirm the vet call shows **021 603 7774** / **+353216037774**.

Let us know if you would like any further voice adjustments after you hear the new NaturalHD message.

Best regards,
Theo
