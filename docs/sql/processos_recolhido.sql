-- Setup completo: fila_faltantes + flag recolhido
-- Rodar no SQL Editor do Supabase (oyvvvxpgqhyowvfaepgu)
-- Idempotente: pode rodar de novo sem erro.

-- 1) Fila de faltantes
create table if not exists public.fila_faltantes (
  sei text primary key,
  status text not null check (status in ('pendente', 'feito')),
  atualizado_em timestamptz not null default now(),
  processo_id uuid null references public.processos(id) on delete set null,
  motivo text null
);

create index if not exists fila_faltantes_status_idx on public.fila_faltantes (status);

alter table public.fila_faltantes enable row level security;

drop policy if exists "fila_faltantes_select_anon" on public.fila_faltantes;
drop policy if exists "fila_faltantes_upsert_anon" on public.fila_faltantes;
drop policy if exists "fila_faltantes_insert_anon" on public.fila_faltantes;
drop policy if exists "fila_faltantes_update_anon" on public.fila_faltantes;

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

-- Se a tabela já existia sem a coluna motivo:
alter table public.fila_faltantes
  add column if not exists motivo text null;

-- 2) Flag no sistema (processos atuais ficam false)
alter table public.processos
  add column if not exists recolhido boolean not null default false;

create index if not exists processos_recolhido_idx on public.processos (recolhido);

comment on column public.processos.recolhido is
  'true = processo marcado como já recolhido; relatórios podem ignorar por padrão';

comment on column public.fila_faltantes.motivo is
  'Motivo do feito na fila (ex.: recolhido). Null = cadastro normal.';
