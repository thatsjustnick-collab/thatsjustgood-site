-- That's Just Good: events, RSVPs, bookings and impact.
-- Run once in Supabase: SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run again: it only creates what's missing.

create extension if not exists pgcrypto;

-- People who can log in to the dashboard. Owners can add and remove team members.
create table if not exists team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now()
);

-- Team building requests and bookings from companies.
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                       -- short code shown to clients, e.g. TJG-4K7Q
  org_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  format text not null check (format in ('host_only', 'all_inclusive')),
  cause text,
  group_size int,
  duration_min int,
  preferred_date date,
  alt_date date,
  start_time text,
  location_type text,                             -- office, restaurant, venue, other
  address text,
  notes text,
  estimate_cents int,                             -- instant estimate shown on the site
  total_cents int,                                -- final price (estimate or Nick's quote)
  deposit_cents int,
  status text not null default 'requested'
    check (status in ('requested', 'quoted', 'deposit_pending', 'confirmed', 'completed', 'cancelled')),
  stripe_checkout_id text,
  deposit_paid_at timestamptz,
  stripe_customer_id text,
  balance_invoice_id text,
  balance_invoice_url text,
  balance_paid_at timestamptz,
  portal_code text unique,                        -- link employees use to RSVP
  organizer_token text unique,                    -- private link for the organizer's headcount view
  event_id uuid,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every event: public community pop-ups, kids events and private company events.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null default 'community' check (kind in ('community', 'kids', 'private')),
  title text not null,
  cause text,
  summary text,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_name text,
  address text,
  parking text,
  what_to_bring text,
  capacity int,                                   -- total spots (party sizes add up); null = no limit
  waitlist boolean not null default true,
  allow_chip_in boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  booking_id uuid references bookings (id) on delete set null,
  cover_url text,
  impact jsonb not null default '{}'::jsonb,      -- { items:[{label,count}], partner, summary, photos:[] }
  report_token text unique,
  report_published_at timestamptz,
  feedback_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bookings drop constraint if exists bookings_event_fk;
alter table bookings add constraint bookings_event_fk foreign key (event_id) references events (id) on delete set null;

-- RSVPs for any event (community attendees and company employees).
create table if not exists rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  sms_opt_in boolean not null default false,
  party_size int not null default 1 check (party_size between 1 and 20),
  status text not null default 'going' check (status in ('going', 'waitlist', 'cancelled')),
  token text not null unique,                     -- manage link and check-in QR
  checked_in_at timestamptz,
  reminder_sent_at timestamptz,
  chip_in_cents int,
  email_opt_in boolean not null default true,     -- hear about future pop-ups
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists rsvps_one_per_email on rsvps (event_id, lower(email)) where status <> 'cancelled';
create index if not exists rsvps_event on rsvps (event_id);
create index if not exists events_starts on events (starts_at);

-- Post-event feedback (also the source of testimonials).
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  name text,
  rating int check (rating between 1 and 5),
  comment text,
  can_quote boolean not null default false,
  created_at timestamptz not null default now()
);

-- Lock everything down. The website reaches the data only through the site's own server functions,
-- which use the secret service key, so no public read or write rules are needed.
alter table team_members enable row level security;
alter table bookings enable row level security;
alter table events enable row level security;
alter table rsvps enable row level security;
alter table feedback enable row level security;

-- Public bucket for event photos shown on impact reports.
insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', true)
on conflict (id) do nothing;
