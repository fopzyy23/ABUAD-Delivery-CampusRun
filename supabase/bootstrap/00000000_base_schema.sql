-- DROPZYY FRESH INSTALL ONLY
-- Apply this file once to an empty Supabase project, before
-- supabase/migrations/*.sql in filename order.
-- Do not run this file as an upgrade migration against an existing project.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  full_name text,
  phone text,
  hostel text,
  email text,
  role text not null default 'user'
);

create table public.vendors (
  id text primary key,
  name text not null,
  icon text,
  type text,
  rating numeric,
  time text,
  cover text,
  open boolean not null default true
);

create table public.products (
  id integer primary key,
  vendor_id text not null references public.vendors(id),
  name text not null,
  "desc" text,
  price numeric not null,
  icon text,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null,
  user_id uuid not null references auth.users(id),
  status text not null default 'Order confirmed',
  total numeric not null,
  fee numeric not null default 0,
  spot text,
  created_at timestamptz not null default now(),
  rider_id uuid
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id integer not null references public.products(id),
  qty integer not null,
  price numeric not null,
  name text not null,
  icon text,
  vendor_id text not null references public.vendors(id),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

grant all on public.profiles, public.vendors, public.products,
  public.orders, public.order_items to anon, authenticated;
