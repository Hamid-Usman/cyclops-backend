import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { GoogleTokenDto, LoginDto, RegisterDto } from './auth.dto';
import type { AuthenticatedRequest } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthResponseDto, PublicUserResponseDto } from './auth.responses';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register an account' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({
    description: 'An account with this email already exists',
  })
  register(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in to an account' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() input: LoginDto) {
    return this.authService.login(input);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with Google',
    description:
      'Exchanges a Google ID token for an access token. Creates the account on first sign-in.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid Google ID token, or no verified email on it',
  })
  @ApiConflictResponse({
    description:
      'A password account already uses this email; log in and link Google instead',
  })
  @ApiServiceUnavailableResponse({
    description: 'GOOGLE_CLIENT_ID is not set',
  })
  signInWithGoogle(@Body() input: GoogleTokenDto) {
    return this.authService.signInWithGoogle(input.idToken);
  }

  @Post('google/link')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Link a Google account to the current user' })
  @ApiBearerAuth('access-token')
  @ApiOkResponse({ type: PublicUserResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing bearer token or invalid Google ID token',
  })
  @ApiConflictResponse({
    description: 'The Google account or this user is already linked elsewhere',
  })
  linkGoogle(
    @Req() request: AuthenticatedRequest,
    @Body() input: GoogleTokenDto,
  ) {
    return this.authService.linkGoogle(request.user.sub, input.idToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiBearerAuth('access-token')
  @ApiOkResponse({ type: PublicUserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.authService.findPublicUser(request.user.sub);
  }
}
