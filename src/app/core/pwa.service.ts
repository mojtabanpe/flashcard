import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** The non-standard event Chromium fires when the app can be installed. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const UPDATE_CHECK_MS = 30 * 60 * 1000;

/** Service-worker updates, install prompt and connectivity for the app shell. */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly updates = inject(SwUpdate);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView!;
  private installEvent: InstallPromptEvent | null = null;

  /** A new version has been downloaded and is used after a reload. */
  readonly updateReady = signal(false);
  /** The cached version is broken (e.g. files were evicted); only a reload helps. */
  readonly broken = signal(false);
  readonly canInstall = signal(false);
  readonly offline = signal(!this.window.navigator.onLine);

  constructor() {
    const destroy = inject(DestroyRef);
    const listen = (target: EventTarget, type: string, handler: (event: Event) => void) => {
      target.addEventListener(type, handler);
      destroy.onDestroy(() => target.removeEventListener(type, handler));
    };
    listen(this.window, 'online', () => this.offline.set(false));
    listen(this.window, 'offline', () => this.offline.set(true));
    listen(this.window, 'beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installEvent = event as InstallPromptEvent;
      this.canInstall.set(true);
    });
    listen(this.window, 'appinstalled', () => {
      this.installEvent = null;
      this.canInstall.set(false);
    });
    if (!this.updates.isEnabled) return;
    const sub = this.updates.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') this.updateReady.set(true);
    });
    const broken = this.updates.unrecoverable.subscribe(() => this.broken.set(true));
    destroy.onDestroy(() => (sub.unsubscribe(), broken.unsubscribe()));
    const check = () => {
      if (!this.offline()) this.updates.checkForUpdate().catch(() => undefined);
    };
    const timer = this.window.setInterval(check, UPDATE_CHECK_MS);
    destroy.onDestroy(() => this.window.clearInterval(timer));
    listen(this.document, 'visibilitychange', () => {
      if (this.document.visibilityState === 'visible') check();
    });
  }

  async install() {
    const event = this.installEvent;
    if (!event) return;
    this.installEvent = null;
    this.canInstall.set(false);
    await event.prompt();
  }

  async reload() {
    if (this.updateReady() && this.updates.isEnabled) await this.updates.activateUpdate().catch(() => undefined);
    this.document.location.reload();
  }

  dismissUpdate() {
    this.updateReady.set(false);
  }
}
