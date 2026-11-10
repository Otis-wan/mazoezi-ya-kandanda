import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators.js';
import { Role } from '../auth/roles.js';
import { DrillIdPipe } from './drill-id.pipe.js';
import { ListDrillsQueryDto } from './drills.dto.js';
import { DrillsService } from './drills.service.js';
import { SetSampleVideoDto } from './sample-video.dto.js';

@ApiTags('drills')
@ApiBearerAuth()
@Controller('drills')
@Roles(Role.ADMIN, Role.SUPER_AGENT, Role.TEAM_MANAGER, Role.PLAYER)
export class DrillsController {
  constructor(private readonly drills: DrillsService) {}

  @Get()
  list(@Query() query: ListDrillsQueryDto) {
    return this.drills.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.drills.get(id);
  }

  /** A method-level @Roles replaces the class-level one (RolesGuard uses getAllAndOverride). */
  @Put(':id/sample-video')
  @Roles(Role.ADMIN, Role.SUPER_AGENT)
  @ApiOperation({ summary: 'Set or clear the sample clip link of a drill' })
  sampleVideo(
    @Param('id', DrillIdPipe) id: string,
    @Body() dto: SetSampleVideoDto,
  ) {
    return this.drills.setSampleVideo(id, dto.url);
  }
}
