# Supabase & Data Security Rules

- **Row Level Security (RLS)**:
  - All database tables (`decks`, `cards`) must have RLS enabled with `auth.uid() = user_id` policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
  - Always verify that created resources attach the active `user_id` before inserting.
- **Client Configuration**:
  - Access Supabase exclusively via `SupabaseService` (`src/app/core/supabase.service.ts`).
  - Do not commit service role keys or administrative bypass tokens to version control.
- **Error Handling**:
  - Catch Supabase PostgREST errors and surface user-friendly toast messages through `ToastService`.
