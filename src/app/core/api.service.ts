import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await firstValueFrom(
        this.http.request<T>(method, environment.apiUrl + path, {
          body,
          withCredentials: true,
          headers: { 'X-Recall-Client': 'web' },
        }),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const message = error.error?.message;
        throw Object.assign(
          new Error(
            Array.isArray(message)
              ? message.join(' ')
              : typeof message === 'string'
                ? message
                : 'Unable to reach the server. Please try again.',
          ),
          { status: error.status },
        );
      }
      throw error;
    }
  }
}
