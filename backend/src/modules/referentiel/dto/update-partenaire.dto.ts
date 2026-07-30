import { PartialType } from '@nestjs/swagger';
import { CreatePartenaireDto } from './create-partenaire.dto';

export class UpdatePartenaireDto extends PartialType(CreatePartenaireDto) {}
