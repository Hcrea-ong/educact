-- EducAct : espace d'établissement partagé
-- À coller dans Supabase > SQL Editor, après le script de synchronisation personnelle.

create table if not exists public.educact_school (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  code text not null unique,
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.educact_member (
  school_id uuid not null references public.educact_school(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display text not null check (char_length(display) between 1 and 80),
  role text not null default 'ens' check (role in ('ens','pp','sg','cen','dir')),
  classes text[] not null default '{}',
  joined_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
alter table public.educact_member add column if not exists classes text[] not null default '{}';

-- Une ligne par enseignant ET par classe : permet de limiter la lecture classe par classe
create table if not exists public.educact_rec (
  school_id uuid not null references public.educact_school(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_key text not null default '',
  data jsonb not null check (pg_column_size(data) < 3000000),
  updated_at timestamptz not null default now(),
  primary key (school_id, user_id, class_key)
);
-- Migration d'une ancienne installation (une ligne par enseignant)
alter table public.educact_rec add column if not exists class_key text not null default '';
alter table public.educact_rec drop constraint if exists educact_rec_pkey;
alter table public.educact_rec add primary key (school_id, user_id, class_key);

-- Fonctions d'appui (security definer pour éviter les boucles de politiques)
create or replace function public.educact_is_member(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.educact_member where school_id = sid and user_id = auth.uid())
$$;

create or replace function public.educact_can_read_all(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.educact_member
                 where school_id = sid and user_id = auth.uid() and role in ('sg','cen','dir'))
$$;

-- Le professeur principal lit les résultats des classes qui lui sont attribuées
create or replace function public.educact_pp_reads(sid uuid, ckey text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.educact_member
                 where school_id = sid and user_id = auth.uid() and role = 'pp' and ckey = any(classes))
$$;

create or replace function public.educact_is_dir(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.educact_member where school_id = sid and user_id = auth.uid() and role = 'dir')
$$;

alter table public.educact_school enable row level security;
alter table public.educact_member enable row level security;
alter table public.educact_rec enable row level security;

drop policy if exists educact_school_select on public.educact_school;
create policy educact_school_select on public.educact_school
  for select to authenticated using (public.educact_is_member(id));

drop policy if exists educact_member_select on public.educact_member;
create policy educact_member_select on public.educact_member
  for select to authenticated using (public.educact_is_member(school_id));
drop policy if exists educact_member_leave on public.educact_member;
create policy educact_member_leave on public.educact_member
  for delete to authenticated using (user_id = auth.uid());

-- Un enseignant ne lit que ses propres résultats ; le professeur principal lit ceux de ses classes ;
-- le surveillant général, le censeur et le chef lisent ceux de tous.
drop policy if exists educact_rec_select on public.educact_rec;
create policy educact_rec_select on public.educact_rec
  for select to authenticated
  using (user_id = auth.uid() or public.educact_can_read_all(school_id) or public.educact_pp_reads(school_id, class_key));
drop policy if exists educact_rec_insert on public.educact_rec;
create policy educact_rec_insert on public.educact_rec
  for insert to authenticated
  with check (user_id = auth.uid() and public.educact_is_member(school_id));
drop policy if exists educact_rec_update on public.educact_rec;
create policy educact_rec_update on public.educact_rec
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.educact_is_member(school_id));
drop policy if exists educact_rec_delete on public.educact_rec;
create policy educact_rec_delete on public.educact_rec
  for delete to authenticated using (user_id = auth.uid());

-- Créer un établissement : le créateur devient chef d'établissement
create or replace function public.educact_create_school(p_name text, p_display text)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.educact_school where code = v_code);
  end loop;
  insert into public.educact_school(name, code, owner)
    values (left(trim(p_name), 120), v_code, auth.uid()) returning id into v_id;
  insert into public.educact_member(school_id, user_id, display, role)
    values (v_id, auth.uid(), left(trim(p_display), 80), 'dir');
  return json_build_object('id', v_id, 'name', left(trim(p_name), 120), 'code', v_code, 'role', 'dir');
end $$;

-- Rejoindre avec le code : toujours comme enseignant ; le chef d'établissement attribue les autres rôles
create or replace function public.educact_join_school(p_code text, p_display text)
returns json language plpgsql security definer set search_path = public as $$
declare s public.educact_school; r text;
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  select * into s from public.educact_school where code = upper(trim(p_code));
  if not found then raise exception 'code'; end if;
  insert into public.educact_member(school_id, user_id, display)
    values (s.id, auth.uid(), left(trim(p_display), 80))
    on conflict (school_id, user_id) do update set display = excluded.display;
  select role into r from public.educact_member where school_id = s.id and user_id = auth.uid();
  return json_build_object('id', s.id, 'name', s.name, 'code', s.code, 'role', r);
end $$;

-- Attribuer un rôle (tout chef d'établissement ; le créateur reste protégé)
create or replace function public.educact_set_role(p_school uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.educact_is_dir(p_school) then raise exception 'forbidden'; end if;
  if p_role not in ('ens','pp','sg','cen','dir') then raise exception 'role'; end if;
  if exists (select 1 from public.educact_school where id = p_school and owner = p_user) and p_role <> 'dir' then
    raise exception 'owner';
  end if;
  update public.educact_member set role = p_role, classes = case when p_role = 'pp' then classes else '{}' end
    where school_id = p_school and user_id = p_user;
end $$;

-- Attribuer les classes d'un professeur principal (clés de classe, ex. '6ea')
create or replace function public.educact_set_classes(p_school uuid, p_user uuid, p_classes text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.educact_is_dir(p_school) then raise exception 'forbidden'; end if;
  update public.educact_member set classes = coalesce(p_classes, '{}')
    where school_id = p_school and user_id = p_user and role = 'pp';
end $$;

-- Retirer un membre (tout chef ; jamais le créateur ni soi-même)
create or replace function public.educact_remove_member(p_school uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.educact_is_dir(p_school) then raise exception 'forbidden'; end if;
  if p_user = auth.uid() or exists (select 1 from public.educact_school where id = p_school and owner = p_user) then
    raise exception 'owner';
  end if;
  delete from public.educact_rec where school_id = p_school and user_id = p_user;
  delete from public.educact_member where school_id = p_school and user_id = p_user;
end $$;

-- Changer le code d'invitation (s'il a fuité)
create or replace function public.educact_new_code(p_school uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.educact_is_dir(p_school) then raise exception 'forbidden'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.educact_school where code = v_code);
  end loop;
  update public.educact_school set code = v_code where id = p_school;
  return v_code;
end $$;

revoke all on function public.educact_create_school(text, text) from public, anon;
revoke all on function public.educact_join_school(text, text) from public, anon;
revoke all on function public.educact_set_role(uuid, uuid, text) from public, anon;
revoke all on function public.educact_set_classes(uuid, uuid, text[]) from public, anon;
revoke all on function public.educact_remove_member(uuid, uuid) from public, anon;
revoke all on function public.educact_new_code(uuid) from public, anon;
grant execute on function public.educact_create_school(text, text) to authenticated;
grant execute on function public.educact_join_school(text, text) to authenticated;
grant execute on function public.educact_set_role(uuid, uuid, text) to authenticated;
grant execute on function public.educact_set_classes(uuid, uuid, text[]) to authenticated;
grant execute on function public.educact_remove_member(uuid, uuid) to authenticated;
grant execute on function public.educact_new_code(uuid) to authenticated;

-- ===== Journal des notes, conservé par le serveur (ajout seul) =====
-- Chaque entrée du journal envoyée avec les résultats est copiée ici à la réception.
-- Aucune politique d'écriture : personne ne peut modifier ni effacer une entrée depuis l'application.
create table if not exists public.educact_audit (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.educact_school(id) on delete cascade,
  user_id uuid not null,
  class_key text not null default '',
  entry jsonb not null,
  at timestamptz not null default now()
);
create index if not exists educact_audit_school_at on public.educact_audit (school_id, at desc);
alter table public.educact_audit enable row level security;
revoke all on public.educact_audit from anon;
revoke insert, update, delete on public.educact_audit from authenticated;
grant select on public.educact_audit to authenticated;

drop policy if exists educact_audit_select on public.educact_audit;
create policy educact_audit_select on public.educact_audit
  for select to authenticated
  using (user_id = auth.uid() or public.educact_can_read_all(school_id) or public.educact_pp_reads(school_id, class_key));

create or replace function public.educact_audit_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.educact_audit(school_id, user_id, class_key, entry)
    select NEW.school_id, NEW.user_id, NEW.class_key, e
    from jsonb_array_elements(case when jsonb_typeof(NEW.data->'lg') = 'array' then NEW.data->'lg' else '[]'::jsonb end) e;
  else
    insert into public.educact_audit(school_id, user_id, class_key, entry)
    select NEW.school_id, NEW.user_id, NEW.class_key, e
    from jsonb_array_elements(case when jsonb_typeof(NEW.data->'lg') = 'array' then NEW.data->'lg' else '[]'::jsonb end) e
    where not exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(OLD.data->'lg') = 'array' then OLD.data->'lg' else '[]'::jsonb end) o
      where o = e);
  end if;
  return NEW;
end $$;

drop trigger if exists educact_rec_audit on public.educact_rec;
create trigger educact_rec_audit after insert or update on public.educact_rec
  for each row execute function public.educact_audit_fn();
