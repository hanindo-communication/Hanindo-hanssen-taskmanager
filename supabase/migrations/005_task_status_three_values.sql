-- Migrate task_status enum from 5 values to 3: pending, followUp, done
-- Old: workingOnIt, review, planned, stuck, done
-- New: pending, followUp, done
-- Mapping: workingOnIt, review -> followUp; planned, stuck -> pending; done -> done

create type task_status_new as enum ('pending', 'followUp', 'done');

alter table public.tasks add column status_new task_status_new not null default 'pending';

update public.tasks set status_new = case status::text
  when 'workingOnIt' then 'followUp'::task_status_new
  when 'review' then 'followUp'::task_status_new
  when 'planned' then 'pending'::task_status_new
  when 'stuck' then 'pending'::task_status_new
  when 'done' then 'done'::task_status_new
  else 'pending'::task_status_new
end;

alter table public.tasks drop column status;
alter table public.tasks rename column status_new to status;

alter table public.tasks alter column status drop default;
drop type task_status;
alter type task_status_new rename to task_status;
alter table public.tasks alter column status set default 'pending'::task_status;
