import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { Role } from '../auth/roles.js';
import { ExternalIdPipe } from '../common/external-id.pipe.js';
import {
  PlayerProgressQueryDto,
  TeamProgressQueryDto,
} from './progress.dto.js';
import { ProgressService } from './progress.service.js';

@ApiTags('progress')
@ApiBearerAuth()
@Controller()
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('players/:externalId/progress')
  @Roles(Role.ADMIN, Role.SUPER_AGENT, Role.TEAM_MANAGER, Role.PLAYER)
  @ApiOperation({
    summary:
      "A player's scores by category and week or month, with the weakest criteria first",
  })
  player(
    @CurrentUser() user: AuthUser,
    @Param('externalId', ExternalIdPipe) externalId: string,
    @Query() query: PlayerProgressQueryDto,
  ) {
    return this.progress.player(user, externalId, query);
  }

  @Get('teams/:externalId/progress')
  @Roles(Role.ADMIN, Role.SUPER_AGENT, Role.TEAM_MANAGER)
  @ApiOperation({
    summary: 'One line per player: work done and average scores',
  })
  team(
    @CurrentUser() user: AuthUser,
    @Param('externalId', ExternalIdPipe) externalId: string,
    @Query() query: TeamProgressQueryDto,
  ) {
    return this.progress.team(user, externalId, query);
  }
}
