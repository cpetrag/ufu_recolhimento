-- Rodar no SQL Editor do Supabase do projeto ufu_recolhimento
create table if not exists public.fila_faltantes (
  sei text primary key,
  status text not null check (status in ('pendente', 'feito')),
  atualizado_em timestamptz not null default now(),
  processo_id uuid null references public.processos(id) on delete set null
);

create index if not exists fila_faltantes_status_idx on public.fila_faltantes (status);

alter table public.fila_faltantes enable row level security;

-- Alinha ao padrão atual do app (anon key no front). Ajuste policies se o projeto endurecer RLS depois.
drop policy if exists "fila_faltantes_select_anon" on public.fila_faltantes;
drop policy if exists "fila_faltantes_upsert_anon" on public.fila_faltantes;

create policy "fila_faltantes_select_anon"
  on public.fila_faltantes for select
  to anon, authenticated
  using (true);

create policy "fila_faltantes_insert_anon"
  on public.fila_faltantes for insert
  to anon, authenticated
  with check (true);

create policy "fila_faltantes_update_anon"
  on public.fila_faltantes for update
  to anon, authenticated
  using (true)
  with check (true);
