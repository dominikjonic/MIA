-- Gemeinsame Logik: Budget-, Angebots- und Fortschrittsberechnung als Views (von App und KI genutzt),
-- Projektvorlage mit Phasen, Aufgaben und Budgetkategorien.

-- ---------------------------------------------------------------- Angebotssummen
create view public.v_offer_totals with (security_invoker = true) as
select
  o.id as offer_id,
  o.owner_id,
  o.tender_id,
  o.contact_id,
  coalesce(c.company, c.name, 'Unbekannt') as bidder,
  o.status,
  o.delivery_weeks,
  o.valid_until,
  o.discount_pct,
  o.extra_costs,
  coalesce(sum(tp.quantity * op.unit_price), 0) as net_positions,
  round(coalesce(sum(tp.quantity * op.unit_price), 0) * (1 - o.discount_pct / 100) + o.extra_costs, 2) as total,
  count(op.position_id) as priced_positions,
  (select count(*) from public.tender_positions p where p.tender_id = o.tender_id) as all_positions
from public.offers o
left join public.contacts c on c.id = o.contact_id
left join public.offer_prices op on op.offer_id = o.id
left join public.tender_positions tp on tp.id = op.position_id
group by o.id, c.company, c.name;

-- ---------------------------------------------------------------- Budget je Kategorie
-- Prognose: Sobald beauftragt wurde, zählt der beauftragte Betrag (mindestens die Rechnungen),
-- sonst der Planwert (mindestens die Rechnungen).
create view public.v_budget_categories with (security_invoker = true) as
select
  b.id as category_id,
  b.owner_id,
  b.project_id,
  b.name,
  b.position,
  b.planned,
  coalesce(sum(c.amount) filter (where c.kind = 'beauftragt'), 0) as committed,
  coalesce(sum(c.amount) filter (where c.kind = 'rechnung'), 0) as invoiced,
  case
    when coalesce(sum(c.amount) filter (where c.kind = 'beauftragt'), 0) > 0
      then greatest(coalesce(sum(c.amount) filter (where c.kind = 'beauftragt'), 0), coalesce(sum(c.amount) filter (where c.kind = 'rechnung'), 0))
    else greatest(b.planned, coalesce(sum(c.amount) filter (where c.kind = 'rechnung'), 0))
  end as forecast
from public.budget_categories b
left join public.costs c on c.category_id = b.id
group by b.id;

-- ---------------------------------------------------------------- Projektstatus
create view public.v_project_status with (security_invoker = true) as
select
  p.id as project_id,
  p.owner_id,
  p.name,
  p.status,
  p.start_date,
  p.move_date,
  p.end_date,
  p.budget_total,
  t.tasks_total,
  t.tasks_done,
  case when t.tasks_total > 0 then round(100.0 * t.tasks_done / t.tasks_total) else 0 end as progress_pct,
  t.overdue,
  t.next_due,
  ph.title as current_phase,
  ph.due_date as current_phase_due,
  coalesce(b.planned, 0) as planned,
  coalesce(b.committed, 0) as committed,
  coalesce(b.invoiced, 0) as invoiced,
  coalesce(b.forecast, 0) as forecast,
  case
    when p.budget_total <= 0 then 'offen'
    when coalesce(b.forecast, 0) > p.budget_total then 'ueberschritten'
    when coalesce(b.forecast, 0) > p.budget_total * 0.9 then 'knapp'
    else 'im_budget'
  end as budget_state
from public.projects p
left join lateral (
  select count(*) as tasks_total,
         count(*) filter (where done) as tasks_done,
         count(*) filter (where not done and due_date < current_date) as overdue,
         min(due_date) filter (where not done) as next_due
  from public.tasks where project_id = p.id
) t on true
left join lateral (
  select title, due_date from public.phases
  where project_id = p.id and status <> 'erledigt'
  order by position limit 1
) ph on true
left join lateral (
  select sum(planned) as planned, sum(committed) as committed, sum(invoiced) as invoiced, sum(forecast) as forecast
  from public.v_budget_categories where project_id = p.id
) b on true;

-- ---------------------------------------------------------------- Phasen automatisch fortschreiben
create function public.sync_phase_status() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_phase uuid := coalesce(new.phase_id, old.phase_id);
        v_open integer; v_done integer;
begin
  if v_phase is null then return null; end if;
  select count(*) filter (where not done), count(*) filter (where done) into v_open, v_done
    from public.tasks where phase_id = v_phase;
  update public.phases set
    status = case when v_open = 0 and v_done > 0 then 'erledigt' when v_done > 0 then 'aktiv' else 'offen' end,
    done_at = case when v_open = 0 and v_done > 0 then coalesce(done_at, now()) else null end
  where id = v_phase;
  return null;
end $$;

create trigger tasks_sync_phase after insert or update of done, phase_id or delete on public.tasks
  for each row execute function public.sync_phase_status();

create function public.set_done_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then new.done_at := now(); end if;
  if not new.done then new.done_at := null; end if;
  return new;
end $$;
create trigger tasks_done_at before insert or update of done on public.tasks
  for each row execute function public.set_done_at();

-- ---------------------------------------------------------------- Projektvorlage
-- Legt die 13 Standardphasen mit Aufgaben und Terminen sowie die Budgetkategorien an.
-- Termine werden anteilig zwischen Projektstart und Umzug/Übergabe verteilt.
create function public.apply_project_template(p_project uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  p record;
  v_end date;
  v_days integer;
  v_cursor numeric := 0;
  v_phase uuid;
  v_start date;
  v_due date;
  ph jsonb;
  t text;
  i integer := 0;
  j integer;
  cat jsonb;
  v_template jsonb := '[
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
  ]';
  v_cats jsonb := '[["Planung & Honorar",8],["Trockenbau",15],["Möbel",45],["Elektro & IT",8],["Boden & Malerei",7],["Akustik & Licht",7],["Umzug",5],["Reserve",5]]';
  v_total_w numeric;
begin
  select * into p from public.projects where id = p_project;
  if not found then raise exception 'Projekt nicht gefunden'; end if;

  v_end := coalesce(p.end_date, p.move_date + 14, p.start_date + 90);
  v_days := greatest(v_end - p.start_date, 14);
  select sum((x->>'w')::numeric) into v_total_w from jsonb_array_elements(v_template) x;

  for ph in select * from jsonb_array_elements(v_template) loop
    i := i + 1;
    v_start := p.start_date + floor(v_days * v_cursor / v_total_w)::integer;
    v_cursor := v_cursor + (ph->>'w')::numeric;
    v_due := p.start_date + floor(v_days * v_cursor / v_total_w)::integer;
    insert into public.phases (owner_id, project_id, key, title, position, start_date, due_date)
      values (p.owner_id, p.id, ph->>'key', ph->>'title', i, v_start, v_due)
      returning id into v_phase;
    j := 0;
    for t in select jsonb_array_elements_text(ph->'tasks') loop
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

-- ---------------------------------------------------------------- Profil bei Registrierung
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (owner_id, user_name) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- ---------------------------------------------------------------- Datei-Speicher
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 104857600);

create policy "eigene Dateien lesen" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "eigene Dateien hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "eigene Dateien ändern" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "eigene Dateien löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
