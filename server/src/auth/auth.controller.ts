import { ForbiddenException, Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, sessionCookie } from './auth.service';
import {
  ChangePasswordDto,
  CredentialsDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.dto';
import { AuthRequest, Public, readToken } from './auth.guard';
import { Throttle } from '@nestjs/throttler';
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Get('session')
  async session(@Req() request: Request) {
    return { user: await this.auth.session(readToken(request)) };
  }
  @Public()
  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async signup(
    @Body() body: CredentialsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (process.env['SIGNUP_ENABLED'] === 'false') throw new ForbiddenException('Sign up is disabled.');
    const session = await this.auth.signUp(body.email, body.password);
    return session ? this.setSession(response, session) : { user: null, verify: true };
  }
  @Public()
  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyEmail(@Body() body: VerifyEmailDto) {
    await this.auth.verifyEmail(body.token);
    return { ok: true };
  }
  @Public()
  @Post('resend-verification')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  resendVerification(@Body() body: ForgotPasswordDto) {
    this.auth.requestVerification(body.email);
    return { ok: true };
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
  async signout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.signOut(readToken(request));
    response.clearCookie(sessionCookie, this.cookieOptions());
    return { user: null };
  }
  @Post('password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @Req() request: AuthRequest,
    @Body() body: ChangePasswordDto,
  ) {
    await this.auth.changePassword(
      request.user,
      body.current_password,
      body.new_password,
      readToken(request),
    );
    return { ok: true };
  }
  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  forgotPassword(@Body() body: ForgotPasswordDto) {
    this.auth.requestPasswordReset(body.email);
    return { ok: true };
  }
  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
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
