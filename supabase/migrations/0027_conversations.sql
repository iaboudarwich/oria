-- Conversation sessions for Ask Oria
create table if not exists public.conversations (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  title          text,                       -- auto-set from first user message
  starred        boolean not null default false,
  deleted_at     timestamptz,                -- soft-delete
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Messages within a conversation
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

-- Indexes
create index if not exists conversations_user_idx
  on public.conversations(created_by, updated_at desc)
  where deleted_at is null;

create index if not exists conversations_org_idx
  on public.conversations(organization_id, updated_at desc)
  where deleted_at is null;

create index if not exists messages_conversation_idx
  on public.messages(conversation_id, created_at asc);

-- RLS
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- conversations: owner can do everything
create policy "conversations_owner_all" on public.conversations
  for all using (created_by = auth.uid());

-- messages: accessible if you own the parent conversation
create policy "messages_owner_all" on public.messages
  for all using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.created_by = auth.uid()
    )
  );

-- Keep updated_at current whenever a message is added
create or replace function public.touch_conversation_updated_at()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute procedure public.touch_conversation_updated_at();
