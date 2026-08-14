# Angular 22 & Frontend Conventions

- **Signals First**: Use Angular signals (`signal`, `computed`, `effect`) for state management within components and services.
- **Standalone Architecture**: All components, pipes, and directives must be `standalone: true` (standard in Angular 22).
- **Dependency Injection**: Use `inject(Service)` instead of constructor injection.
- **Template Control Flow**: Use modern built-in control flow syntax (`@if`, `@for`, `@switch`, `@let`) instead of structural directives (`*ngIf`, `*ngFor`).
- **Zoneless Safety**: Never rely on `NgZone.run()` or manual `ChangeDetectorRef.detectChanges()` unless dealing with legacy third-party listeners.
- **CSS / SCSS**: Follow the token definitions in `src/styles.scss`. Utilize modern CSS features like CSS nesting, container queries, `:has()`, and custom properties.
- **Accessibility (a11y)**: Ensure all interactive components have appropriate ARIA attributes, semantic HTML tags, keyboard navigation handlers, and distinct focus rings.
