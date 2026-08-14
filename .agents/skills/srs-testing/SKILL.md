---
name: srs-testing
description: >-
  Run the test suite and verify the SM-2 spaced repetition calculations, interval scheduling, and Lightner leech thresholds in src/app/core/srs.ts. Use when modifying SRS logic or running project unit tests.
---

# SRS & Algorithmic Testing Skill

This skill guides running tests and validating the SM-2 spaced-repetition logic in Recall.

## 1. Running Tests

Run the Vitest test runner:
```bash
npm test -- --run
```

Or to run specific SRS tests:
```bash
npx vitest run src/app/core/srs.spec.ts
```

## 2. Verifying Algorithmic Constraints

When testing `src/app/core/srs.ts`:
- **Again (Quality 1)**: Resets streak (`repetitions = 0`), interval to `0` days, increments `lapses`, sets `due_at` to +5 minutes, and eases down by 0.2 (minimum ease: 1.3).
- **Hard (Quality 3)**: Passes card, increments repetitions, reduces next interval growth to ~60% of ease.
- **Good (Quality 4)**: Standard interval geometric growth (`interval * ease_factor`).
- **Easy (Quality 5)**: Boosts interval by ~1.3x and increases ease factor.
- **Lightner Leech Threshold**: `lapses >= 8` and `ease_factor <= 1.3` marks `isLeech(card) = true`.
- **Max Suspensions**: `suspensions >= 2` marks `isBeyondSalvage(card) = true`.
