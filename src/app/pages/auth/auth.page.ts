import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-auth',
  imports: [FormsModule],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly mode = signal<'signin' | 'signup'>('signin');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);

  protected toggle() {
    this.mode.set(this.mode() === 'signin' ? 'signup' : 'signin');
  }

  protected async submit() {
    const email = this.email().trim();
    const password = this.password();
    if (!email || password.length < 6) {
      this.toast.error('Enter an email and a password of at least 6 characters.');
      return;
    }

    this.busy.set(true);
    try {
      if (this.mode() === 'signup') {
        await this.auth.signUp(email, password);
        // Accounts are auto-confirmed server-side; if sign-up didn't return a
        // live session, sign in straight away for a seamless first run.
        if (!this.auth.isAuthenticated()) {
          await this.auth.signIn(email, password);
        }
        this.toast.show('Welcome to Recall ✦');
        this.router.navigateByUrl('/');
      } else {
        await this.auth.signIn(email, password);
        this.toast.show('Welcome back ✦');
        this.router.navigateByUrl('/');
      }
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}
