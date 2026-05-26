import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marque un endpoint comme accessible sans authentification.
 * Usage : @Public() au-dessus du @Controller ou de la methode.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
