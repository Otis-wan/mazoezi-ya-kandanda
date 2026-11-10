import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class SetSampleVideoDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://cdn.example.org/clips/bm-001.mp4',
    description: 'An https link to the clip. Send null to remove it.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((o: SetSampleVideoDto) => o.url !== null)
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string | null;
}
