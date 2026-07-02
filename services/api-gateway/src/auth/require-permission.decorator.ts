import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

/** Declare the `resource:action` permission required to call a route. */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
