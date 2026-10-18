-- DOM – Büromöblierung & Umzugskoordination
-- Datenmodell. Jede Zeile gehört einem Benutzer (owner_id); RLS sorgt dafür, dass niemand fremde Daten sieht.

-- ---------------------------------------------------------------- Profil & Konnektoren
create table public.profiles (
  owner_id uuid primary key default auth.uid() references auth.users on delete cascade,
  user_name text,
  company_name text,
  email_signature text,
  whatsapp_number text,              -- eigene Nummer im internationalen Format, z. B. 4366412345678
  timezone text not null default 'Europe/Vienna',
  briefing_enabled boolean not null default true,
  briefing_time time not null default '07:30',
  briefing_last_sent date,
  quiet_start time default '20:00',
  quiet_end time default '07:00',
  reminder_channel text not null default 'whatsapp' check (reminder_channel in ('whatsapp', 'app')),
  created_at timestamptz not null default now()
);

create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null,                -- claude | whatsapp | google | higgsfield | blender | sketchup | autocad | mcp | api
  name text not null,
  mode text not null default 'api' check (mode in ('api', 'mcp', 'bridge', 'oauth')),
  config jsonb not null default '{}',-- nicht geheime Einstellungen (URLs, Modell, IDs)
  has_secret boolean not null default false,
  enabled boolean not null default true,
  status text not null default 'unbekannt' check (status in ('unbekannt', 'verbunden', 'fehler')),
  status_message text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, kind, name)
);

-- Geheimnisse liegen getrennt und sind nur für Edge Functions (Service Role) lesbar.
create table public.connector_secrets (
  connector_id uuid primary key references public.connectors on delete cascade,
  owner_id uuid not null references auth.users on delete cascade,
  secrets jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.internal_settings (key text primary key, value text not null);
insert into public.internal_settings (key, value) values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'));

-- ---------------------------------------------------------------- Stammdaten
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'lieferant' check (kind in ('kunde', 'lieferant', 'handwerker', 'spedition', 'sonstige')),
  company text,
  name text,
  trade text,                        -- Gewerk / Sortiment
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  client_id uuid references public.contacts on delete set null,
  address text,
  status text not null default 'aktiv' check (status in ('aktiv', 'pausiert', 'abgeschlossen')),
  start_date date not null default current_date,
  move_date date,                    -- Umzug / Bezug
  end_date date,                     -- Übergabe
  budget_total numeric(12,2) not null default 0,
  area_sqm numeric(10,2),
  workplaces integer,
  style text,                        -- Konzept-Stichworte für Entwurf & Visualisierung
  description text,
  created_at timestamptz not null default now()
);

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  key text not null,
  title text not null,
  position integer not null,
  status text not null default 'offen' check (status in ('offen', 'aktiv', 'erledigt')),
  start_date date,
  due_date date,
  done_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references public.projects on delete cascade,
  phase_id uuid references public.phases on delete set null,
  title text not null,
  notes text,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  priority integer not null default 0,     -- 0 normal, 1 hoch
  remind_at timestamptz,
  reminded_at timestamptz,
  position integer not null default 0,
  created_by text not null default 'app',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Budget
create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  name text not null,
  planned numeric(12,2) not null default 0,
  position integer not null default 0
);

create table public.costs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  category_id uuid references public.budget_categories on delete set null,
  kind text not null check (kind in ('beauftragt', 'rechnung')),
  title text not null,
  amount numeric(12,2) not null,
  cost_date date not null default current_date,
  contact_id uuid references public.contacts on delete set null,
  offer_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Stückliste
create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  room text,
  category text,                     -- z. B. Arbeitsplatz, Stauraum, Akustik, Trockenbau
  name text not null,
  article_no text,
  manufacturer text,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'Stk',
  unit_price_est numeric(12,2),      -- Budgetpreis
  notes text,
  source text not null default 'manuell', -- manuell | csv | dxf | sketchup | blender | autocad | ki
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Ausschreibung & Angebote
create table public.tenders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  title text not null,
  category_id uuid references public.budget_categories on delete set null,
  description text,
  deadline date,
  status text not null default 'entwurf' check (status in ('entwurf', 'versendet', 'vergeben')),
  awarded_offer_id uuid,
  created_at timestamptz not null default now()
);

create table public.tender_positions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  tender_id uuid not null references public.tenders on delete cascade,
  item_id uuid references public.items on delete set null,
  title text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'Stk',
  position integer not null default 0
);

create table public.tender_bidders (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  tender_id uuid not null references public.tenders on delete cascade,
  contact_id uuid not null references public.contacts on delete cascade,
  invited_at timestamptz,
  primary key (tender_id, contact_id)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  tender_id uuid not null references public.tenders on delete cascade,
  contact_id uuid references public.contacts on delete set null,
  received_date date not null default current_date,
  valid_until date,
  delivery_weeks numeric(5,1),
  discount_pct numeric(5,2) not null default 0,
  extra_costs numeric(12,2) not null default 0,   -- Fracht, Montage, Pauschalen
  notes text,
  status text not null default 'eingegangen' check (status in ('eingegangen', 'vergeben', 'abgelehnt')),
  created_at timestamptz not null default now()
);

alter table public.tenders add constraint tenders_awarded_offer_fk foreign key (awarded_offer_id) references public.offers on delete set null;
alter table public.costs add constraint costs_offer_fk foreign key (offer_id) references public.offers on delete cascade;

create table public.offer_prices (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  offer_id uuid not null references public.offers on delete cascade,
  position_id uuid not null references public.tender_positions on delete cascade,
  unit_price numeric(12,2) not null,
  primary key (offer_id, position_id)
);

-- ---------------------------------------------------------------- Termine, Doku, Dateien, Umzug
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references public.projects on delete cascade,
  contact_id uuid references public.contacts on delete set null,
  title text not null,
  kind text not null default 'termin' check (kind in ('termin', 'besichtigung', 'aufmass', 'praesentation', 'lieferung', 'montage', 'umzug', 'abnahme')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  notes text,
  remind_minutes integer not null default 60,
  reminded_at timestamptz,
  google_event_id text,
  created_at timestamptz not null default now()
);

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  phase_id uuid references public.phases on delete set null,
  entry_date date not null default current_date,
  text text not null,
  source text not null default 'app',
  created_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references public.projects on delete cascade,
  log_id uuid references public.logs on delete set null,
  kind text not null default 'dokument' check (kind in ('foto', 'plan', 'cad', 'visualisierung', 'angebot', 'dokument')),
  storage_path text not null,
  name text not null,
  mime text,
  size bigint,
  caption text,
  created_at timestamptz not null default now()
);

create table public.move_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  from_room text,
  to_room text not null,
  department text,
  persons integer not null default 0,
  crates integer not null default 0,
  furniture text,
  it_notes text,
  label_color text not null default 'blau',
  position integer not null default 0
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references public.projects on delete cascade,
  text text not null,
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_by text not null default 'app',
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  channel text not null default 'app' check (channel in ('app', 'whatsapp', 'system')),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.visualizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  prompt text not null,
  provider text not null default 'higgsfield',
  status text not null default 'entwurf' check (status in ('entwurf', 'laeuft', 'fertig', 'fehler')),
  request_id text,
  result_url text,
  error text,
  created_at timestamptz not null default now()
);

-- Aufträge an die Desktop-Brücke (Blender / SketchUp / AutoCAD auf dem eigenen Rechner)
create table public.bridge_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  target text not null check (target in ('blender', 'sketchup', 'autocad')),
  project_id uuid references public.projects on delete cascade,
  action text not null,              -- z. B. export_bom, render, open_model, mcp_call
  payload jsonb not null default '{}',
  status text not null default 'offen' check (status in ('offen', 'laeuft', 'fertig', 'fehler')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Indizes
create index on public.phases (project_id, position);
create index on public.tasks (owner_id, done, due_date);
create index on public.tasks (project_id);
create index on public.tasks (remind_at) where reminded_at is null and remind_at is not null;
create index on public.budget_categories (project_id);
create index on public.costs (project_id);
create index on public.items (project_id);
create index on public.tenders (project_id);
create index on public.tender_positions (tender_id);
create index on public.offers (tender_id);
create index on public.appointments (owner_id, starts_at);
create index on public.logs (project_id, entry_date desc);
create index on public.files (project_id);
create index on public.move_rooms (project_id);
create index on public.reminders (remind_at) where sent_at is null;
create index on public.messages (owner_id, created_at desc);
create index on public.visualizations (project_id);
create index on public.bridge_jobs (owner_id, status);

-- ---------------------------------------------------------------- Row Level Security
do $$
declare t text;
begin
  foreach t in array array['profiles','connectors','contacts','projects','phases','tasks','budget_categories','costs',
    'items','tenders','tender_positions','tender_bidders','offers','offer_prices','appointments','logs','files',
    'move_rooms','reminders','messages','visualizations','bridge_jobs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "eigene Daten" on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Geheimnisse & interne Werte: RLS an, keine Policy → nur Service Role
alter table public.connector_secrets enable row level security;
alter table public.internal_settings enable row level security;
revoke all on public.connector_secrets from anon, authenticated;
revoke all on public.internal_settings from anon, authenticated;
