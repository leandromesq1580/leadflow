# Outbound numbers by lead state

Authorized scope (2026-09-03): one Twilio local voice number in Texas and one in
Massachusetts, USD 1.15/month each, plus usage/taxes. No changes to SMS senders,
existing phone numbers, subscriptions, lead distribution, or call recording.

The outbound TwiML handler passes the lead ID to `pickCallerId`:

1. Load the saved state only if the lead's normalized phone matches the dialed
   number. A mismatched/stale ID cannot select another lead's state.
2. If the state is missing/invalid or the lookup fails, infer it from the existing
   US area-code map. This is an inference, not the person's physical location.
3. Among `voice_numbers` for that state, prefer the same area code; otherwise use
   the oldest registered number. One number therefore covers the entire state.
4. If no number is registered for the state, keep `TWILIO_FROM_NUMBER`. Never use a
   different state's pool number just because the lead kept an old phone number.
5. A missing/unavailable pool also preserves the existing fallback.

Pool records contain `phone_number`, `phone_sid`, `area_code`, and `state` (USPS
code). Only register voice-capable numbers owned by the same production Twilio
account. Purchasing a number alone does not activate it in the pool. Do not
register existing unrelated numbers or change the global fallback.

Numbers are enabled here for **outbound caller ID only**. Inbound forwarding,
ElevenLabs agents, and SMS campaigns are separate configuration and are not
enabled or copied automatically to newly purchased numbers.

Run `npm run test:voice-routing`. All test destinations are fictional; tests
validate selection and signed TwiML responses without originating calls. Production
verification can POST a correctly signed request to `/api/voice/outbound` and
inspect the XML only; do not send it to Twilio's Calls API or invoke the status
callback (which can trigger messages/follow-ups).
