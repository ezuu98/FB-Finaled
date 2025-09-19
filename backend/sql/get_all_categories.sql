-- Run this in Supabase SQL editor to create the RPC used by the app
-- Returns a distinct sorted list of category display names (or names if display_name is null)
create or replace function public.get_all_categories()
returns setof text
language sql
security invoker
set search_path = public
as $$
  select distinct
    coalesce(nullif(trim(display_name), ''), nullif(trim(name), ''))::text as name
  from public.categories
  order by 1;
$$;

-- Optional indexes for performance (run separately):
-- create index if not exists idx_categories_display_name on public.categories (display_name);
-- create index if not exists idx_categories_name on public.categories (name);
