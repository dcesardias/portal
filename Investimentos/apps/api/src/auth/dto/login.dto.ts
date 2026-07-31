import { IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  login!: string;

  @IsString()
  @MinLength(1)
  senha!: string;
}
