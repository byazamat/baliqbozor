import { PlatformRole } from '@baliqbozor/domain';
import { LOCALES, type Locale } from '@baliqbozor/i18n';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, MaxLength } from 'class-validator';

export class OtpRequestDto {
  @ApiProperty({
    example: '+998901234567',
    description: 'Номер Узбекистана; принимаются пробелы, скобки, дефисы',
  })
  @IsString()
  @MaxLength(32)
  phone!: string;
}

export class OtpRequestResultDto {
  @ApiProperty({ example: 60, description: 'Через сколько секунд можно запросить код снова' })
  resendAfterSec!: number;
}

export class OtpVerifyDto extends OtpRequestDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken!: string;
}

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '+998901234567' })
  phone!: string;

  @ApiProperty({ type: String, nullable: true })
  fullName!: string | null;

  @ApiProperty({ enum: LOCALES, enumName: 'Locale' })
  locale!: Locale;

  @ApiProperty({ enum: Object.values(PlatformRole), enumName: 'PlatformRole' })
  platformRole!: PlatformRole;
}

export class TokenPairDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Срок жизни access-токена, с' })
  accessTokenExpiresIn!: number;
}

export class LoginResultDto extends TokenPairDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ description: 'Пользователь создан этим входом — нужен онбординг' })
  isNewUser!: boolean;
}
