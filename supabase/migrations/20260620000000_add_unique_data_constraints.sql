create unique index if not exists labor_estimates_vehicle_repair_task_unique
on public.labor_estimates (vehicle_id, repair_task_id);

create unique index if not exists repair_scores_vehicle_repair_task_unique
on public.repair_scores (vehicle_id, repair_task_id);
