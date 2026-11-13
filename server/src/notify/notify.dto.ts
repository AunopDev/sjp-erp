import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class NotifyConfigDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  lineEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoApproval?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  smtpPass?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mailFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  mailTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lineToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lineTo?: string;

  @IsOptional()
  @IsBoolean()
  smtpPassSet?: boolean;

  @IsOptional()
  @IsBoolean()
  lineTokenSet?: boolean;

  @IsOptional()
  @IsObject()
  envFallback?: Record<string, boolean>;
}

export class NotifyTestDto {
  @IsOptional()
  @IsIn(['email', 'line'])
  channel?: 'email' | 'line';
}
