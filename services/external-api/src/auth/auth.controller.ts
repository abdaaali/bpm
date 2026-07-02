import { Controller, Post, Get, Body, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('api/ext/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    if (!body.email || !body.password) {
      throw new UnauthorizedException('Email and password required');
    }
    const user = await this.authService.validateUser(body.email, body.password);
    return this.authService.login(user);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: any) {
    return this.authService.getProfile(req.user.sub);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() req: any) {
    // JWT is stateless; client should discard token
    return { success: true, message: 'Logged out successfully' };
  }
}
