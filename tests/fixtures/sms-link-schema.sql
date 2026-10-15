-- Synthetic local-only schema for executing migration 070; never production.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.leads (id uuid PRIMARY KEY, name text, phone text, assigned_to uuid, created_at timestamptz);
CREATE TABLE public.sms_messages (
  id uuid PRIMARY KEY, lead_id uuid REFERENCES public.leads(id), direction text,
  status text, from_phone text, to_phone text, body text, twilio_sid text, created_at timestamptz
);
