import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from './auth-user.js';
import { CurrentUser, Roles } from './decorators.js';
import { Role } from './roles.js';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  @Get()
  @Roles(Role.ADMIN, Role.SUPER_AGENT, Role.TEAM_MANAGER)
  me(@CurrentUser() user: AuthUser) {
    return { id: user.id, role: user.role, teamIds: user.teamIds };
  }
}