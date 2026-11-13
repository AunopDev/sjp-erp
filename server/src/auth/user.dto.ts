import { IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const USERNAME = /^[A-Za-z0-9._-]{3,50}$/;

export class CreateUserDto {
  @IsString()
  @Matches(USERNAME, { message: 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–50 ตัวอักษร' })
  username!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsString()
  @MaxLength(80)
  roleId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dept?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  team?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  projectIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  siteIds?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Matches(USERNAME, { message: 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–50 ตัวอักษร' })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dept?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  team?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  projectIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  siteIds?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
