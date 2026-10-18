-- Budgetstatus präziser: „knapp“ bedeutet, dass mindestens eine Kategorie über Plan liegt,
-- das Gesamtbudget aber noch hält. Ein Plan, der das Budget exakt ausschöpft, ist „im Budget“.
create or replace view public.v_project_status with (security_invoker = true) as
select
  p.id as project_id, p.owner_id, p.name, p.status, p.start_date, p.move_date, p.end_date, p.budget_total,
  t.tasks_total, t.tasks_done,
  case when t.tasks_total > 0 then round(100.0 * t.tasks_done / t.tasks_total) else 0 end as progress_pct,
  t.overdue, t.next_due,
  ph.title as current_phase, ph.due_date as current_phase_due,
  coalesce(b.planned, 0) as planned, coalesce(b.committed, 0) as committed,
  coalesce(b.invoiced, 0) as invoiced, coalesce(b.forecast, 0) as forecast,
  case
    when p.budget_total <= 0 then 'offen'
    when coalesce(b.forecast, 0) > p.budget_total then 'ueberschritten'
    when coalesce(b.over_plan, 0) > 0 then 'knapp'
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
  select sum(planned) as planned, sum(committed) as committed, sum(invoiced) as invoiced, sum(forecast) as forecast,
         count(*) filter (where forecast > planned and planned > 0) as over_plan
  from public.v_budget_categories where project_id = p.id
) b on true;
