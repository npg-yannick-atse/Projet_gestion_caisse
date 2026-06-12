import { PartialType } from '@nestjs/swagger';
import { CreateNatureOperationDto } from './create-nature-operation.dto';

export class UpdateNatureOperationDto extends PartialType(CreateNatureOperationDto) {}
