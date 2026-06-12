import { IsString, IsOptional, IsBoolean, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  code!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  libelle!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  module!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class UpdatePermissionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  module?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class AssignPermissionToRoleDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  roleId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  permissionId!: string;
}

export class RemovePermissionFromRoleDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  roleId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  permissionId!: string;
}
