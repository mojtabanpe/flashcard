import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-account',
  imports: [FormsModule],
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly current = signal('');
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly busy = signal(false);

  protected async submit() {
    const password = this.password();
    if (!this.current()) {
      this.toast.error('Enter your current password.');
      return;
    }
    if (password.length < 6) {
      this.toast.error('Choose a new password of at least 6 characters.');
      return;
    }
    if (password !== this.confirm()) {
      this.toast.error('The two new passwords do not match.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.changePassword(this.current(), password);
      this.current.set('');
      this.password.set('');
      this.confirm.set('');
      this.toast.success('Password changed. Other devices were signed out.');
    } catch (e: any) {
      this.toast.error(e?.message ?? 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}
