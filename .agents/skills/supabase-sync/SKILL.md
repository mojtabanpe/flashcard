---
name: supabase-sync
description: >-
  Workflows for managing Supabase schemas, tables, authentication, and security policies for Recall. Use when updating models, data contracts, or database triggers.
---

# Supabase Management Skill

This skill documents the schema, auth setup, and sync procedures for the Supabase backend.

## 1. Schema Reference

### `decks` Table
- `id`: `uuid` (primary key, default `gen_random_uuid()`)
- `user_id`: `uuid` (foreign key to `auth.users`, default `auth.uid()`)
- `name`: `text` (required)
- `description`: `text` (optional)
- `color`: `text` (hex/token for deck background/accent)
- `created_at`: `timestamptz`
- `updated_at`: `timestamptz`

### `cards` Table
- `id`: `uuid` (primary key, default `gen_random_uuid()`)
- `deck_id`: `uuid` (foreign key to `decks.id` on delete cascade)
- `user_id`: `uuid` (foreign key to `auth.users`, default `auth.uid()`)
- `front`: `text` (front side markdown/text)
- `back`: `text` (back side markdown/text)
- `ease_factor`: `float8` (default 2.5)
- `interval_days`: `int4` (default 0)
- `repetitions`: `int4` (default 0)
- `lapses`: `int4` (default 0)
- `suspended`: `bool` (default false)
- `suspensions`: `int4` (default 0)
- `due_at`: `timestamptz`
- `last_reviewed_at`: `timestamptz`
- `created_at`, `updated_at`: `timestamptz`

## 2. RLS Policies
Ensure every new table or relation has RLS enabled:
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own data"
ON table_name
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```
