import { BadRequestException, Injectable } from '@nestjs/common';
import { ageBandToCode, codeToAgeBand } from '../drills/drill-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpsertPlayerDto, UpsertTeamDto } from './people.dto.js';

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertTeam(externalId: string, dto: UpsertTeamDto) {
    const data = { name: dto.name, ageBand: codeToAgeBand(dto.ageBand) };
    const team = await this.prisma.team.upsert({
      where: { externalId },
      create: { externalId, ...data },
      update: data,
    });
    return {
      externalId: team.externalId,
      name: team.name,
      ageBand: ageBandToCode(team.ageBand),
    };
  }

  /** A full replace: a field you leave out goes back to empty (isActive to true). */
  async upsertPlayer(externalId: string, dto: UpsertPlayerDto) {
    let teamId: string | null = null;
    if (dto.teamExternalId) {
      const team = await this.prisma.team.findUnique({
        where: { externalId: dto.teamExternalId },
        select: { id: true },
      });
      if (!team) {
        throw new BadRequestException(`Unknown team: ${dto.teamExternalId}`);
      }
      teamId = team.id;
    }
    const data = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      birthYear: dto.birthYear,
      position: dto.position ?? null,
      teamId,
      isActive: dto.isActive ?? true,
    };
    const player = await this.prisma.player.upsert({
      where: { externalId },
      create: { externalId, ...data },
      update: data,
      include: { team: { select: { externalId: true } } },
    });
    return {
      externalId: player.externalId,
      firstName: player.firstName,
      lastName: player.lastName,
      birthYear: player.birthYear,
      position: player.position,
      teamExternalId: player.team?.externalId ?? null,
      isActive: player.isActive,
    };
  }
}
