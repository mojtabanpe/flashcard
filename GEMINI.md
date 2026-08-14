# Recall — Agent Instructions & Project Context

You are pair programming on **Recall**, a modern spaced-repetition flashcard web application built with **Angular 22** and **Supabase**.

---

## 1. Project Overview & Architecture

- **Framework**: Angular 22 (Standalone components, Zoneless change detection, Angular Signals).
- **Backend & Database**: Supabase (PostgreSQL, Supabase Auth, Row-Level Security / RLS).
- **Core Algorithm**: SM-2 Spaced Repetition + Lightner method leech detection ([src/app/core/srs.ts](file:///Users/mojtabanpe/Projects/personal/flashcard/src/app/core/srs.ts)).
- **Styles**: SCSS global design system with custom CSS variables ([src/styles.scss](file:///Users/mojtabanpe/Projects/personal/flashcard/src/styles.scss)), bold typography (Fraunces, Archivo, DM Mono), and 3D card flip transitions.
- **Testing**: Vitest (`npm test`).
- **Dev Server**: `npm start` (Runs on `http://localhost:4333`).

---

## 2. Directory Structure

```
src/
  app/
    core/            # Supabase client, Auth, Deck & Card services, SRS logic, Guards, Models
    pages/
      auth/          # Sign-in and sign-up flows
      decks/         # Deck dashboard & creation modal
      deck-detail/   # Card management & deck settings
      study/         # 3D interactive flashcard review session
    app.ts           # Shell component with navigation bar & toast notifications
  styles.scss        # Design tokens, global resets, typography, and utility classes
```

---

## 3. Key Development Standards

1. **Angular 22 Conventions**:
   - Always use **standalone components** and `inject()` for dependency injection.
   - Prefer **Angular Signals** (`signal()`, `computed()`, `effect()`) for reactive state over RxJS Subjects when managing local component state.
   - Maintain zoneless compatibility (avoid reliance on `NgZone` or manual change detection triggers).

2. **Supabase & RLS Security**:
   - All client queries must respect Row-Level Security (`auth.uid() = user_id`).
   - Use [src/app/core/supabase.service.ts](file:///Users/mojtabanpe/Projects/personal/flashcard/src/app/core/supabase.service.ts) for client access.
   - Do not expose secret service role keys in frontend code; use the publishable key in `src/environments/environment.ts`.

3. **Spaced Repetition Logic**:
   - Keep SM-2 calculations in [src/app/core/srs.ts](file:///Users/mojtabanpe/Projects/personal/flashcard/src/app/core/srs.ts) pure and deterministic.
   - Changes to SRS calculation formulas must be covered with unit tests.

4. **Design & UX Quality**:
   - Adhere to design tokens defined in [src/styles.scss](file:///Users/mojtabanpe/Projects/personal/flashcard/src/styles.scss).
   - Maintain fluid micro-interactions, responsive layouts, keyboard accessibility (e.g. `Space` to flip, `1-4` to grade), and clean dark/light contrast.

---

## 4. Leveraging Available Skills & Tools

When working on this project, actively invoke and adhere to the relevant available skills:

- **`modern-web-guidance`**: Execute for frontend/CSS/HTML architecture, modern CSS features (`:has()`, container queries, backdrop filters), and performance optimizations.
- **`a11y-debugging`**: Use to test and verify accessibility, ARIA live regions (especially during flashcard study reviews), keyboard navigation, and color contrast.
- **`chrome-devtools`**: Use for inspecting network requests (Supabase API calls), troubleshooting DOM state, and debugging runtime behavior.
- **`debug-optimize-lcp` & `memory-leak-debugging`**: Use when optimizing load times, rendering performance, or auditing memory usage during long study sessions.
- **`agy-customizations`**: Use when maintaining, updating, or expanding workspace rules, skills, and configuration files.

---

## 5. Standard Commands

- Run dev server: `npm start`
- Run test suite: `npm test`
- Build production bundle: `npm run build`
