-- GRIT DIGITAL CLUB - 045: entry by scanning the gym's rotating QR (kiosk screen at the door)
-- with the member app. Recorded like other attempts, source 'self_scan'.
alter type public.attempt_source add value if not exists 'self_scan';
