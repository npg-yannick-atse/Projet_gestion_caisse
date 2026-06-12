import { IsString, IsOptional, IsBoolean, IsNotEmpty, MaxLength, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ROLE_CODES, RoleCode } from '../../entities/role.entity';

export class CreateRoleDto {
  @ApiProperty({ enum: [...ROLE_CODES] })
  @IsNotEmpty()
  @IsIn(ROLE_CODES)
  code!: RoleCode;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  libelle!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ default: false })
  @IsOptional()
  @IsBoolean()
  estSysteme?: boolean;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class UpdateRoleDto {
  @ApiProperty({ required: false, enum: [...ROLE_CODES] })
  @IsOptional()
  @IsIn(ROLE_CODES)
  code?: RoleCode;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}
