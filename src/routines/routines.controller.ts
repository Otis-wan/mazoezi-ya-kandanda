import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { Role } from '../auth/roles.js';
import {
  CreateRoutineDto,
  ListRoutinesQueryDto,
  UpdateRoutineDto,
} from './routines.dto.js';
import { RoutinesService } from './routines.service.js';

@ApiTags('routines')
@ApiBearerAuth()
@Controller('routines')
@Roles(Role.ADMIN, Role.SUPER_AGENT, Role.TEAM_MANAGER)
export class RoutinesController {
  constructor(private readonly routines: RoutinesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoutineDto) {
    return this.routines.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListRoutinesQueryDto) {
    return this.routines.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.routines.get(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoutineDto,
  ) {
    return this.routines.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.routines.remove(user, id);
  }
}
