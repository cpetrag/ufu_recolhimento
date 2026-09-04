-- Marcar processos como recolhidos + motivo na fila
-- Rodar no SQL Editor do Supabase (oyvvvxpgqhyowvfaepgu)

-- 1) Flag no sistema (atuais ficam false)
alter table public.processos
  add column if not exists recolhido boolean not null default false;

create index if not exists processos_recolhido_idx on public.processos (recolhido);

-- 2) Motivo na fila (ex.: 'recolhido' quando pulou cadastro completo)
alter table public.fila_faltantes
  add column if not exists motivo text null;

comment on column public.processos.recolhido is
  'true = processo marcado como já recolhido; relatórios podem ignorar por padrão';

comment on column public.fila_faltantes.motivo is
  'Motivo do feito na fila (ex.: recolhido). Null = cadastro normal.';
