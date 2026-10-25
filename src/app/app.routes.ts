import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage),
  },
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./pages/verify-email/verify-email.page').then((m) => m.VerifyEmailPage),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./pages/reset-password/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/account/account.page').then((m) => m.AccountPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/decks/decks.page').then((m) => m.DecksPage),
  },
  {
    path: 'deck/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/deck-detail/deck-detail.page').then((m) => m.DeckDetailPage),
  },
  {
    path: 'deck/:id/study',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/study/study.page').then((m) => m.StudyPage),
  },
  {
    path: 'read',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/texts/texts.page').then((m) => m.TextsPage),
  },
  {
    path: 'practice',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/practice/practice.page').then((m) => m.PracticePage),
  },
  {
    path: 'read/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/reader/reader.page').then((m) => m.ReaderPage),
  },
  { path: '**', redirectTo: '' },
];
