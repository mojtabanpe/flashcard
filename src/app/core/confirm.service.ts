import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
}

/** In-app replacement for the browser's native confirm(); rendered once by the app shell. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);
  private resolve: ((ok: boolean) => void) | null = null;

  ask(title: string, message: string, confirmLabel = 'Delete', danger = true): Promise<boolean> {
    this.resolve?.(false);
    this.request.set({ title, message, confirmLabel, danger });
    return new Promise((resolve) => (this.resolve = resolve));
  }

  answer(ok: boolean) {
    this.resolve?.(ok);
    this.resolve = null;
    this.request.set(null);
  }
}
