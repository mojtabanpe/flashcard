import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
export interface User {
  id: string;
  email: string;
}
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly _user = signal<User | null | undefined>(undefined);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._user());
  readonly ready = computed(() => this._user() !== undefined);
  constructor() {
    void this.api
      .request<{ user: User | null }>('GET', '/auth/session')
      .then((result) => this._user.set(result.user))
      .catch(() => this._user.set(null));
  }
  /** Resolves true when a confirmation email must be opened before signing in. */
  async signUp(email: string, password: string) {
    const result = await this.api.request<{ user: User | null; verify?: boolean }>(
      'POST',
      '/auth/signup',
      { email, password },
    );
    this._user.set(result.user);
    return !!result.verify;
  }
  async verifyEmail(token: string) {
    await this.api.request('POST', '/auth/verify-email', { token });
  }
  async resendVerification(email: string) {
    await this.api.request('POST', '/auth/resend-verification', { email });
  }
  async signIn(email: string, password: string) {
    const result = await this.api.request<{ user: User }>('POST', '/auth/signin', {
      email,
      password,
    });
    this._user.set(result.user);
  }
  async changePassword(currentPassword: string, newPassword: string) {
    await this.api.request('POST', '/auth/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }
  async forgotPassword(email: string) {
    await this.api.request('POST', '/auth/forgot-password', { email });
  }
  /** Resetting signs out every session, including this one. */
  async resetPassword(token: string, password: string) {
    await this.api.request('POST', '/auth/reset-password', { token, password });
    this._user.set(null);
  }
  async signOut() {
    await this.api.request('POST', '/auth/signout', {});
    this._user.set(null);
  }
}
