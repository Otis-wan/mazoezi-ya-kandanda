import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { Role } from '../auth/roles.js';
import {
  CreateAssignmentsDto,
  ListAssignmentsQueryDto,
  ListMineQueryDto,
  ReviewWorkDto,
  SubmitWorkDto,
  UpdateAssignmentDto,
} from './assignments.dto.js';
import { AssignmentsService } from './assignments.service.js';
import { WorkService } from './work.service.js';

const STAFF = [Role.ADMIN, Role.SUPER_AGENT, Role.TEAM_MANAGER] as const;

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly work: WorkService,
  ) {}

  // ---- staff ----

  @Post()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Assign a routine to one or more players' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAssignmentsDto) {
    return this.assignments.create(user, dto);
  }

  @Get()
  @Roles(...STAFF)
  @ApiOperation({ summary: 'List assignments for the players you manage' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListAssignmentsQueryDto) {
    return this.assignments.list(user, query);
  }

  // ---- player ----

  @Get('mine')
  @Roles(Role.PLAYER)
  @ApiOperation({ summary: "A player's own assignments, most urgent first" })
  mine(@CurrentUser() user: AuthUser, @Query() query: ListMineQueryDto) {
    return this.assignments.listMine(user, query);
  }

  // ---- one assignment ----

  @Get(':id')
  @Roles(...STAFF, Role.PLAYER)
  @ApiOperation({
    summary: 'One assignment with drills, rubrics, hand-in, review and scores',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.get(user, id);
  }

  @Patch(':id')
  @Roles(...STAFF)
  @ApiOperation({ summary: 'Change the due time or note of open work' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignments.update(user, id, dto);
  }

  @Post(':id/cancel')
  @Roles(...STAFF)
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assignments.cancel(user, id);
  }

  @Post(':id/start')
  @Roles(Role.PLAYER)
  @HttpCode(200)
  @ApiOperation({ summary: 'The player starts the work' })
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.start(user, id);
  }

  @Put(':id/submission')
  @Roles(Role.PLAYER)
  @ApiOperation({
    summary: 'The player hands in the work, with self scores and feedback',
  })
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitWorkDto,
  ) {
    return this.work.submit(user, id, dto);
  }

  @Put(':id/review')
  @Roles(...STAFF)
  @ApiOperation({
    summary: 'The coach reviews handed-in work, with scores and feedback',
  })
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewWorkDto,
  ) {
    return this.work.review(user, id, dto);
  }
}
