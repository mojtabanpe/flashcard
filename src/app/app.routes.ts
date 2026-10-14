import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage),
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
    path: 'read/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/reader/reader.page').then((m) => m.ReaderPage),
  },
  { path: '**', redirectTo: '' },
];
