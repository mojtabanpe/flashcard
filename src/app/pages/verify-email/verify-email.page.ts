import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-verify-email',
  imports: [RouterLink],
  templateUrl: './verify-email.page.html',
  styleUrl: './verify-email.page.scss',
})
export class VerifyEmailPage {
  private readonly auth = inject(AuthService);

  /** From the emailed link's ?token= query parameter. */
  readonly token = input<string>();
  protected readonly state = signal<'working' | 'done' | 'failed'>('working');
  protected readonly message = signal('');

  constructor() {
    effect(() => {
      const token = this.token();
      if (!token) {
        this.state.set('failed');
        this.message.set('This confirmation link is incomplete. Open the link from the email again.');
        return;
      }
      void this.confirm(token);
    });
  }

  private async confirm(token: string) {
    try {
      await this.auth.verifyEmail(token);
      this.state.set('done');
    } catch (e: any) {
      this.message.set(e?.message ?? 'Something went wrong.');
      this.state.set('failed');
    }
  }
}
