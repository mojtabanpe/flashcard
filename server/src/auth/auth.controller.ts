import { ForbiddenException, Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, sessionCookie } from './auth.service';
import { CredentialsDto } from './auth.dto';
import { Public, readToken } from './auth.guard';
import { Throttle } from '@nestjs/throttler';
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Get('session')
  session(@Req() request: Request) {
    return { user: this.auth.session(readToken(request)) };
  }
  @Public()
  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async signup(
    @Body() body: CredentialsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (process.env['SIGNUP_ENABLED'] === 'false') throw new ForbiddenException('Sign up is disabled.');
    return this.setSession(
      response,
      await this.auth.signUp(body.email, body.password),
    );
  }
  @Public()
  @Post('signin')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async signin(
    @Body() body: CredentialsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.setSession(
      response,
      await this.auth.signIn(body.email, body.password),
    );
  }
  @Public()
  @Post('signout')
  signout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.auth.signOut(readToken(request));
    response.clearCookie(sessionCookie, this.cookieOptions());
    return { user: null };
  }
  private cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax' as const,
      path: '/api',
    };
  }
  private setSession(
    response: Response,
    session: {
      user: { id: string; email: string };
      token: string;
      maxAge: number;
    },
  ) {
    response.cookie(sessionCookie, session.token, {
      ...this.cookieOptions(),
      maxAge: session.maxAge,
    });
    return { user: session.user };
  }
}
