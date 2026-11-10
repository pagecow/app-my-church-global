-- Groups feature — schema
--
-- Additive only: creates four tables and one nullable column. No existing row
-- is read, rewritten or deleted, so this is safe to run on the live database.
--
-- Invariant this migration establishes and everything else depends on:
--   posts.group_id IS NULL  =>  church-wide post (today's behaviour)
--   posts.group_id NOT NULL =>  post visible to that group's members only
--
-- Conventions matched from the existing schema: text ids supplied by the server
-- (gen_random_uuid() default so inserts do not have to), snake_case columns,
-- timestamp without time zone, and app_id for the church (Native Notify's
-- "app" means 23936; this app's "app" means a church).

begin;

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id                text primary key default gen_random_uuid()::text,
  app_id            text not null references public.apps(id) on delete cascade,
  name              text not null,
  description       text,
  visibility        text not null default 'private'
                      check (visibility in ('private', 'public')),
  status            text not null default 'active'
                      check (status in ('active', 'archived')),
  cover_image_url   text,
  created_by        text references public.church_users(id) on delete set null,
  -- Native Notify classic topic group, always 'grp-<id>', derived server-side.
  topic_name        text,
  -- NULL means the topic group has not been confirmed created yet. A retry job
  -- converges these; the group is usable either way.
  topic_synced_at   timestamp without time zone,
  created_at        timestamp without time zone not null default CURRENT_TIMESTAMP,
  updated_at        timestamp without time zone not null default CURRENT_TIMESTAMP
);

create index if not exists idx_groups_app on public.groups (app_id);
create index if not exists idx_groups_app_status
  on public.groups (app_id, status) where status = 'active';
create unique index if not exists idx_groups_topic_name
  on public.groups (topic_name) where topic_name is not null;

-- ---------------------------------------------------------------------------
-- group_members — the only source of truth for access. Every read resolves
-- against this table; never against a request body or a client-sent role.
-- ---------------------------------------------------------------------------
create table if not exists public.group_members (
  id                   text primary key default gen_random_uuid()::text,
  group_id             text not null references public.groups(id) on delete cascade,
  church_user_id       text not null references public.church_users(id) on delete cascade,
  role                 text not null default 'member'
                         check (role in ('owner', 'admin', 'member')),
  -- NULL until the member's indie id is confirmed on the classic topic group.
  topic_subscribed_at  timestamp without time zone,
  joined_at            timestamp without time zone not null default CURRENT_TIMESTAMP,
  created_at           timestamp without time zone not null default CURRENT_TIMESTAMP,
  updated_at           timestamp without time zone not null default CURRENT_TIMESTAMP,
  unique (group_id, church_user_id)
);

create index if not exists idx_group_members_group on public.group_members (group_id);
create index if not exists idx_group_members_user on public.group_members (church_user_id);
-- Exactly one owner per group.
create unique index if not exists idx_group_members_one_owner
  on public.group_members (group_id) where role = 'owner';

-- ---------------------------------------------------------------------------
-- group_invites
-- ---------------------------------------------------------------------------
create table if not exists public.group_invites (
  id           text primary key default gen_random_uuid()::text,
  group_id     text not null references public.groups(id) on delete cascade,
  code         text not null unique,
  email        text,
  created_by   text references public.church_users(id) on delete set null,
  expires_at   timestamp without time zone,
  accepted_at  timestamp without time zone,
  accepted_by  text references public.church_users(id) on delete set null,
  created_at   timestamp without time zone not null default CURRENT_TIMESTAMP
);

create index if not exists idx_group_invites_group on public.group_invites (group_id);

-- ---------------------------------------------------------------------------
-- group_join_requests
--
-- The unique (group_id, church_user_id) is deliberate: a denied user
-- re-requests by flipping status back to pending rather than inserting a second
-- row, so the table cannot be used to spam a group owner.
-- ---------------------------------------------------------------------------
create table if not exists public.group_join_requests (
  id              text primary key default gen_random_uuid()::text,
  group_id        text not null references public.groups(id) on delete cascade,
  church_user_id  text not null references public.church_users(id) on delete cascade,
  message         text,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'denied')),
  decided_by      text references public.church_users(id) on delete set null,
  decided_at      timestamp without time zone,
  created_at      timestamp without time zone not null default CURRENT_TIMESTAMP,
  updated_at      timestamp without time zone not null default CURRENT_TIMESTAMP,
  unique (group_id, church_user_id)
);

create index if not exists idx_group_join_requests_pending
  on public.group_join_requests (group_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- posts.group_id — the load-bearing column
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists group_id text references public.groups(id) on delete cascade;

-- Partial index: the church-wide feed filters on "group_id is null", so indexing
-- only the non-null side keeps the home feed's index small.
create index if not exists idx_posts_group
  on public.posts (group_id, created_at desc) where group_id is not null;

commit;
