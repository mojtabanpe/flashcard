import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from './auth.service';

/** Waits for the session to resolve, then allows or redirects to /login. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.user).pipe(
    filter((u) => u !== undefined),
    take(1),
    map((u) => (u ? true : router.createUrlTree(['/login']))),
  );
};

/** Keeps signed-in users away from the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return toObservable(auth.user).pipe(
    filter((u) => u !== undefined),
    take(1),
    map((u) => (u ? router.createUrlTree(['/']) : true)),
  );
};
