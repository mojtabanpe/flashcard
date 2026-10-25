import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './reset-password.page.html',
  styleUrl: './reset-password.page.scss',
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** From the emailed link's ?token= query parameter. */
  readonly token = input<string>();
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly busy = signal(false);

  protected async submit() {
    const token = this.token();
    const password = this.password();
    if (password.length < 6) {
      this.toast.error('Choose a password of at least 6 characters.');
      return;
    }
    if (password !== this.confirm()) {
      this.toast.error('The two passwords do not match.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.resetPassword(token ?? '', password);
      this.toast.success('Password reset. Sign in with your new password.');
      this.router.navigateByUrl('/login');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}
