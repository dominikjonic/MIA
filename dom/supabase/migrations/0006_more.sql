-- Mängelliste, Zeiterfassung, Kunden-Freigaben, eigene Projektvorlagen, Gmail-Angebotsimport, Nachfass-Automatik.

create table public.defects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  title text not null,
  location text,
  contact_id uuid references public.contacts on delete set null,   -- zuständiger Handwerker/Lieferant
  status text not null default 'offen' check (status in ('offen', 'behoben')),
  due_date date,
  file_id uuid references public.files on delete set null,         -- Foto
  notes text,
  fixed_at timestamptz,
  followup_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  phase_id uuid references public.phases on delete set null,
  entry_date date not null default current_date,
  minutes integer,                 -- null, solange die Stoppuhr läuft
  started_at timestamptz,          -- gesetzt, solange die Stoppuhr läuft
  note text,
  created_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  title text not null,
  description text,
  file_id uuid references public.files on delete set null,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  status text not null default 'offen' check (status in ('offen', 'freigegeben', 'abgelehnt')),
  client_name text,
  client_comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  template jsonb not null,         -- {"phases":[{"title","w","tasks":[]}], "cats":[["Möbel",45], …]}
  created_at timestamptz not null default now()
);

create table public.gmail_imports (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  message_id text not null,
  tender_id uuid references public.tenders on delete set null,
  offer_id uuid references public.offers on delete set null,
  created_at timestamptz not null default now(),
  primary key (owner_id, message_id)
);

alter table public.profiles add column hourly_rate numeric(10,2);
alter table public.profiles add column gmail_checked_at timestamptz;
alter table public.tender_bidders add column followup_at timestamptz;
alter table public.offers add column source text not null default 'manuell';
alter table public.offers add column file_id uuid references public.files on delete set null;

create index on public.defects (project_id, status);
create index on public.time_entries (project_id, entry_date);
create index on public.time_entries (owner_id) where started_at is not null;
create index on public.approvals (project_id);
create index on public.project_templates (owner_id);

do $$
declare t text;
begin
  foreach t in array array['defects', 'time_entries', 'approvals', 'project_templates', 'gmail_imports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "eigene Daten" on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- Projektvorlage mit wählbarer Vorlage
-- p_template: null = Standard (13 Phasen), sonst {"phases":[{"title","w","tasks":[…]}],"cats":[[name,prozent],…]}
create function public.apply_project_template(p_project uuid, p_template jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  p record; v_end date; v_days integer; v_cursor numeric := 0; v_phase uuid;
  v_start date; v_due date; ph jsonb; t text; i integer := 0; j integer; cat jsonb;
  v_phases jsonb; v_cats jsonb; v_total_w numeric;
  v_default jsonb := '{"phases":[
    {"key":"anlage","title":"Projektanlage & Briefing","w":3,"tasks":["Kundendaten und Ansprechpartner erfassen","Briefing-Gespräch führen","Budgetrahmen und Termine klären","Projektordner und Unterlagen anlegen"]},
    {"key":"aufmass","title":"Naturmaß & Bestandsaufnahme","w":5,"tasks":["Aufmaßtermin vereinbaren","Naturmaß vor Ort nehmen","Bestand fotografieren","Grundriss digitalisieren (AutoCAD)","Anschlüsse Elektro/Daten dokumentieren"]},
    {"key":"konzept","title":"Konzept & Entwurf","w":8,"tasks":["Bedarfsanalyse Arbeitsplätze und Flächen","Moodboard und Materialkonzept erstellen","Entwurfsvarianten ausarbeiten","Entwurf dem Kunden präsentieren","Freigabe Entwurf einholen"]},
    {"key":"planung","title":"Planung","w":8,"tasks":["Möblierungsplan erstellen","Elektro- und Datenplanung abstimmen","Fluchtwege und Brandschutz prüfen","Freigabe Planung einholen"]},
    {"key":"trockenbau","title":"Trockenbauplanung","w":6,"tasks":["Wände, Decken und Akustik planen","Details und Anschlüsse zeichnen","Mengen ermitteln","Abstimmung mit Vermieter/Hausverwaltung"]},
    {"key":"moeblierung","title":"Möblierung & Stückliste","w":6,"tasks":["Möbel auswählen","Stückliste erstellen","Muster und Farbproben anfordern","Materialien und Farben festlegen"]},
    {"key":"visualisierung","title":"Visualisierung","w":5,"tasks":["3D-Modell aufbauen (SketchUp/Blender)","Renderings erstellen (Higgsfield)","Visualisierung präsentieren"]},
    {"key":"ausschreibung","title":"Ausschreibung","w":6,"tasks":["Leistungsverzeichnisse erstellen","Bieterliste festlegen","Ausschreibungen versenden","Rückfragen der Bieter beantworten"]},
    {"key":"vergleich","title":"Angebotsvergleich","w":5,"tasks":["Angebote erfassen","Preisspiegel erstellen","Nachverhandeln"]},
    {"key":"vergabe","title":"Auftragsvergabe","w":4,"tasks":["Vergabeempfehlung an Kunden","Freigabe Kunde einholen","Aufträge erteilen","Absagen versenden"]},
    {"key":"terminierung","title":"Terminierung","w":5,"tasks":["Bauzeitenplan erstellen","Liefer- und Montagetermine bestätigen","Umzugstermin fixieren","Spedition beauftragen"]},
    {"key":"umzug","title":"Umzug","w":10,"tasks":["Raumzuordnung und Umzugsplan erstellen","Umzugsetiketten drucken","IT-Abbau und -Aufbau koordinieren","Mitarbeiter informieren","Umzug begleiten"]},
    {"key":"ueberwachung","title":"Projektüberwachung & Abnahme","w":14,"tasks":["Wöchentliche Baustellenbesichtigung","Mängelliste führen","Abnahme mit Kunde","Übergabe und Dokumentation","Schlussrechnungen prüfen"]}
  ],"cats":[["Planung & Honorar",8],["Trockenbau",15],["Möbel",45],["Elektro & IT",8],["Boden & Malerei",7],["Akustik & Licht",7],["Umzug",5],["Reserve",5]]}';
begin
  select * into p from public.projects where id = p_project;
  if not found then raise exception 'Projekt nicht gefunden'; end if;
  v_phases := coalesce(p_template->'phases', v_default->'phases');
  v_cats := coalesce(p_template->'cats', v_default->'cats');
  v_end := coalesce(p.end_date, p.move_date + 14, p.start_date + 90);
  v_days := greatest(v_end - p.start_date, 14);
  select sum(coalesce((x->>'w')::numeric, 5)) into v_total_w from jsonb_array_elements(v_phases) x;
  for ph in select * from jsonb_array_elements(v_phases) loop
    i := i + 1;
    v_start := p.start_date + floor(v_days * v_cursor / v_total_w)::integer;
    v_cursor := v_cursor + coalesce((ph->>'w')::numeric, 5);
    v_due := p.start_date + floor(v_days * v_cursor / v_total_w)::integer;
    insert into public.phases (owner_id, project_id, key, title, position, start_date, due_date)
      values (p.owner_id, p.id, coalesce(ph->>'key', 'phase' || i), ph->>'title', i, v_start, v_due)
      returning id into v_phase;
    j := 0;
    for t in select jsonb_array_elements_text(coalesce(ph->'tasks', '[]'::jsonb)) loop
      j := j + 1;
      insert into public.tasks (owner_id, project_id, phase_id, title, due_date, position, created_by)
        values (p.owner_id, p.id, v_phase, t, v_due, j, 'vorlage');
    end loop;
  end loop;
  j := 0;
  for cat in select * from jsonb_array_elements(v_cats) loop
    j := j + 1;
    insert into public.budget_categories (owner_id, project_id, name, planned, position)
      values (p.owner_id, p.id, cat->>0, round(p.budget_total * (cat->>1)::numeric / 100, 2), j);
  end loop;
end $$;

-- Bisherige Ein-Parameter-Variante bleibt erhalten und nutzt die Standardvorlage.
create or replace function public.apply_project_template(p_project uuid) returns void
language sql security invoker set search_path = '' as $$
  select public.apply_project_template(p_project, null::jsonb);
$$;
