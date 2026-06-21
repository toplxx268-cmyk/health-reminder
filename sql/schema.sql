-- =============================================================
-- 健康提醒 (Health Reminder) — Supabase Database Schema
-- Run this in Supabase SQL Editor (https://supabase.com)
-- =============================================================

-- 1. Reminders (提醒设置)
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  type text not null check (
    type in ('wakeUp','medication','exercise','tea','diet','eyeCare','sedentary','writing','bedtime','custom')
    OR type ~ '^(wakeUp|medication|exercise|tea|diet|eyeCare|sedentary|writing|bedtime|custom)_\d+$'
  ),
  title text not null,
  is_enabled boolean default true,
  time time not null,
  message text not null,
  interval_minutes int,
  active_hours_start time,
  active_hours_end time,
  video_link text,
  selected_tea_key text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table reminders enable row level security;

-- Separate policies for each operation (explicit WITH CHECK for INSERT)
create policy "Users can view their own reminders"
  on reminders for select
  using (auth.uid() = user_id);

create policy "Users can create their own reminders"
  on reminders for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own reminders"
  on reminders for update
  using (auth.uid() = user_id);

create policy "Users can delete their own reminders"
  on reminders for delete
  using (auth.uid() = user_id);

-- 2. Meal entries (饮食记录)
create table meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  date text not null,  -- format: YYYY-MM-DD
  time timestamptz not null default now(),
  food_groups text[] not null default '{}',
  notes text default '',
  created_at timestamptz default now()
);

alter table meal_entries enable row level security;

create policy "Users can manage their own meal entries"
  on meal_entries for all
  using (auth.uid() = user_id);

-- 3. Daily completions (每日完成记录)
create table daily_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date text not null,  -- format: YYYY-MM-DD
  reminder_id uuid not null,
  completed_at timestamptz default now(),
  unique (user_id, date, reminder_id)
);

alter table daily_completions enable row level security;

create policy "Users can manage their own completions"
  on daily_completions for all
  using (auth.uid() = user_id);

-- 4. Indexes (for performance)
create unique index if not exists reminders_user_type_idx on reminders (user_id, type);
create index meal_entries_user_date_idx on meal_entries (user_id, date);
create index daily_completions_user_date_idx on daily_completions (user_id, date);

-- 5. Helper function: create default reminders for a given user
-- Accepts user_id explicitly (avoids auth.uid() issues from client calls)
create or replace function create_default_reminders_for(uid uuid)
returns setof reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into reminders (user_id, type, title, is_enabled, time, message, interval_minutes, active_hours_start, active_hours_end, selected_tea_key)
  values
    (uid, 'wakeUp',     '起床',       true, '07:30', '早上好！新的一天开始了 ☀️',                    null, null, null, null),
    (uid, 'medication', '吃药',       true, '08:00', '别忘了吃药 💊',                               null, null, null, null),
    (uid, 'exercise',   '运动',       true, '08:30', '该运动了！🏃',                                null, null, null, null),
    (uid, 'diet',       '记录饮食',   true, '12:30', '该记录饮食了！今天吃了什么？🥗',              null, null, null, null),
    (uid, 'tea',        '泡茶',       true, '10:00', '泡杯茶休息一下 🍵',                          null, null, null, 'chrysanthemum'),
    (uid, 'eyeCare',    '20-20-20 护眼', true, '09:00', '看远处20秒，保护眼睛 👀', 20, '09:00', '18:00', null),
    (uid, 'sedentary',  '久坐提醒',   true, '09:00', '起来走动一下！🚶',                            60, '09:00', '18:00', null),
    (uid, 'writing',    '写论文',     true, '09:00', '专注写作时间 📝',                              null, '09:00', '12:00', null),
    (uid, 'bedtime',    '上床睡觉',   true, '23:00', '该上床睡觉了 😴',                            null, null, null, null)
  returning *;
end;
$$;
