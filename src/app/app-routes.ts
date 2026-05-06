import { Routes } from '@angular/router';
import { HomePage } from './pages/home/home.page';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'home',
    component: HomePage,
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'shop',
    loadComponent: () =>
      import('./pages/shop/shop.page').then((m) => m.ShopPage),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./pages/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'difficulty/:categoryId',
    loadComponent: () =>
      import('./pages/difficulty/difficulty.page').then(
        (m) => m.DifficultyPage,
      ),
  },
  {
    path: 'quiz/:categoryId/:difficultyId',
    loadComponent: () =>
      import('./pages/quiz/quiz.page').then((m) => m.QuizPage),
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
