import { Body, Controller, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators.js';
import { Role } from '../auth/roles.js';
import { ExternalIdPipe } from '../common/external-id.pipe.js';
import { UpsertPlayerDto, UpsertTeamDto } from './people.dto.js';
import { PeopleService } from './people.service.js';

/** Called by the main site's server, with an admin token, to keep the copy here current. */
@ApiTags('sync')
@ApiBearerAuth()
@Controller()
@Roles(Role.ADMIN, Role.SUPER_AGENT)
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Put('teams/:externalId')
  @ApiOperation({ summary: 'Create or replace a team, by the main site ID' })
  team(
    @Param('externalId', ExternalIdPipe) externalId: string,
    @Body() dto: UpsertTeamDto,
  ) {
    return this.people.upsertTeam(externalId, dto);
  }

  @Put('players/:externalId')
  @ApiOperation({ summary: 'Create or replace a player, by the main site ID' })
  player(
    @Param('externalId', ExternalIdPipe) externalId: string,
    @Body() dto: UpsertPlayerDto,
  ) {
    return this.people.upsertPlayer(externalId, dto);
  }
}
