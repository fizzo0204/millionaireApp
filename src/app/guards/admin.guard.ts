import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { AdminUsersService } from 'src/app/services/admin-users.service';

export const adminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const adminUsersService = inject(AdminUsersService);
  const router = inject(Router);

  const user = await firstValueFrom(authService.user$);

  if (adminUsersService.isAdminUser(user)) {
    return true;
  }

  return router.createUrlTree(['/home']);
};
