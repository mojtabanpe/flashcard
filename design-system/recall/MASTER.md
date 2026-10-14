# Recall interface

A focused vocabulary app for an adult English learner. Keep the chrome quiet and make the word the memorable element.

## Direction
- Porcelain background #F3F6FB, white surfaces, ink #182638, muted text #52647A, primary blue #2456D8.
- Archivo for application UI and definitions. Fraunces only for the vocabulary prompt and brand mark.
- Shared spacing: 8, 12, 16, 24, 32px. Containers at 1120px, review at 840px. Mobile gutters 20px (16px during review).
- Thin structural borders and restrained shadows. Avoid decorative gradients and staggered list entrances.
- Use native controls with visible focus rings, targets of at least 44px, and reduced motion support.

## Workflows
- Library: quick review suggestion based on an actual due deck, search, visible deck actions.
- Deck: collapsed card composer, search across words/definitions/examples, unit filter, 30-card progressive loading.
- Study: word first, reveal meaning, optional ! examples in a bottom sheet on mobile or centred dialog on desktop, then rate. Keep controls outside content.
- Unit is separate lowercase metadata such as u19. Examples are collapsed for each new card. Vocabulary stays English-only.
- Modals trap focus, isolate background controls, close on Escape and restore focus.

## Research
Used ui-ux-pro-max product and Angular searches. Its educational-app recommendation leaned toward claymorphism and marketing-page patterns; those did not fit sustained adult study, so the implementation uses calmer application surfaces. Retained its interaction, contrast, responsive layout and explicit-state guidance.
