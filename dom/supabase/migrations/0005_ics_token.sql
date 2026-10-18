-- Geheimer Link zum Abonnieren des DOM-Kalenders (Apple Kalender, Outlook, Google)
alter table public.profiles add column ics_token text not null default encode(extensions.gen_random_bytes(18), 'hex');
create unique index profiles_ics_token_idx on public.profiles (ics_token);
