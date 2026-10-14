import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService, sessionCookie, User } from './auth.service';
export const Public = () => SetMetadata('public', true);
export type AuthRequest = Request & { user: User };
export function readToken(request: Request): string | undefined {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(sessionCookie + '='));
  return cookie?.slice(sessionCookie.length + 1);
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const user = this.auth.session(readToken(request));
    if (!user) throw new UnauthorizedException('Please sign in.');
    request.user = user;
    return true;
  }
}
