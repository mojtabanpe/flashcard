import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ToastService } from './core/toast.service';
import { ConfirmService } from './core/confirm.service';
import { DialogFocus } from './core/dialog-focus';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, DialogFocus],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly toast = inject(ToastService);
  protected readonly confirm = inject(ConfirmService);
  private readonly document = inject(DOCUMENT);

  protected skipToContent(event: Event) {
    event.preventDefault();
    this.document.getElementById('main-content')?.focus();
  }

  async signOut() {
    await this.auth.signOut();
    this.toast.show('Signed out');
  }
}
