import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class WebhookDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  secret?: string;

  @IsOptional()
  events?: string[] | string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
