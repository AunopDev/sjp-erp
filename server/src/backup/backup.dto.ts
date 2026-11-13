import { IsObject, IsString, MaxLength } from 'class-validator';

export class BackupExportDto {
  @IsString()
  @MaxLength(200)
  password!: string;
}

export class BackupRestoreDto {
  @IsObject()
  payload!: unknown;

  @IsString()
  @MaxLength(20)
  confirm!: string;

  @IsString()
  @MaxLength(200)
  password!: string;
}

export class LegacyImportDto {
  @IsObject()
  state!: unknown;

  @IsString()
  @MaxLength(20)
  confirm!: string;
}
