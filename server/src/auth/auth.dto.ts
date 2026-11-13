import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const USERNAME = /^[A-Za-z0-9._-]{3,50}$/;

export class LoginDto {
  @IsString()
  @MaxLength(50)
  username!: string;

  @IsString()
  @MaxLength(200)
  password!: string;
}

export class SetupDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(USERNAME, { message: 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–50 ตัวอักษร' })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}
