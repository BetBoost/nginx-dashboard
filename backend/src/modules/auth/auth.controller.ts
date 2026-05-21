import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '@common/decorators/public.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '@common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, {
      ip,
      userAgent: req.headers['user-agent'],
    });

    // Refresh token is stored in an HttpOnly cookie. Access token in body.
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies?.refresh_token as string) ?? req.body?.refreshToken;
    const result = await this.auth.refresh(token);
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.id, { ip, userAgent: req.headers['user-agent'] });
    res.clearCookie('refresh_token', { path: '/api/auth' });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
