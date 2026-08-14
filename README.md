# Recall — spaced-repetition flashcards

A vibrant, focused flashcard app built with **Angular 22** (standalone, zoneless,
signals) and **Supabase** (Postgres + Auth + Row-Level Security). Create decks,
add cards, and review them on an SM-2 spaced-repetition schedule.

## Features

- **Email/password auth** via Supabase Auth, with each user seeing only their own data (enforced by RLS).
- **Decks & cards** — full CRUD, six deck colours, live "due now" counts.
- **Study mode** — a 3D flip card, four-grade rating (Again / Hard / Good / Easy)
  with next-interval previews, keyboard shortcuts (`Space` to flip, `1–4` to grade),
  and a progress bar.
- **Lightner method** — cards that keep failing (8+ lapses with a crushed ease
  factor) are auto-suspended as "leeches" so they stop burning review time;
  suspended cards can be restored from the deck page, and cards suspended twice
  are flagged for deletion.
- **SM-2 scheduling** — ease factor, interval and due date update on every review
  ([`src/app/core/srs.ts`](src/app/core/srs.ts)).
- **Design** — bold, modern interface: clean white cards with vibrant blue accents,
  Fraunces display serif, Archivo UI, DM Mono labels.

## Project structure

```
src/app/
  core/        supabase client, auth + decks + cards services, SM-2 logic, guards
  pages/
    auth/        sign in / sign up
    decks/       dashboard (deck grid + create-deck modal)
    deck-detail/ manage cards, edit/delete deck
    study/       flip-card review session
  app.ts       shell: top bar + toast host
src/styles.scss  global design system (CSS variables, components)
```

## Running locally

```bash
pnpm install
pnpm start       # serves on http://localhost:4333
```

Open http://localhost:4333, create an account, and start building decks.

## Backend (Supabase)

This app is wired to a live Supabase project. Connection details live in
[`src/environments/environment.ts`](src/environments/environment.ts) (URL +
publishable key — safe to ship to the browser; RLS protects the data).

Schema (applied via migrations):

- `decks` — `id, user_id, name, description, color, timestamps`
- `cards` — `id, deck_id, user_id, front, back, ease_factor, interval_days, repetitions, lapses, suspended, suspensions, due_at, last_reviewed_at, timestamps`
- RLS policies restrict every row to `auth.uid() = user_id`.
- A `before insert` trigger on `auth.users` auto-confirms new signups, because no
  SMTP is configured — so users can sign in immediately after registering. If you
  later configure email delivery, drop the `auto_confirm_user_trigger` and enable
  "Confirm email" in the Supabase dashboard.

## Build

```bash
pnpm run build   # production build into dist/
```
