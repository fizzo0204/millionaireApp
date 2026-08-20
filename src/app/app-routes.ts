import { Routes } from '@angular/router';
import { HomePage } from './pages/home/home.page';
import { adminGuard } from './guards/admin.guard';

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
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'admin-users',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/admin-users/admin-users.page').then(
        (m) => m.AdminUsersPage,
      ),
  },
  {
    path: 'shop',
    loadComponent: () =>
      import('./pages/shop/shop.page').then((m) => m.ShopPage),
  },
  {
    path: 'events/missions',
    loadComponent: () =>
      import('./pages/events-missions/events-missions.page').then(
        (m) => m.EventsMissionsPage,
      ),
  },
  {
    path: 'events/daily-reward',
    loadComponent: () =>
      import('./pages/events-daily-reward/events-daily-reward.page').then(
        (m) => m.EventsDailyRewardPage,
      ),
  },
  {
    path: 'events/wheel',
    loadComponent: () =>
      import('./pages/events-wheel/events-wheel.page').then(
        (m) => m.EventsWheelPage,
      ),
  },
  {
    path: 'events/challenge',
    loadComponent: () =>
      import('./pages/events-challenge/events-challenge.page').then(
        (m) => m.EventsChallengePage,
      ),
  },
  {
    path: 'events',
    loadComponent: () =>
      import('./pages/events/events.page').then((m) => m.EventsPage),
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
    path: 'quiz/:categoryId/:difficultyId/:levelNumber',
    loadComponent: () =>
      import('./pages/quiz/quiz.page').then((m) => m.QuizPage),
  },
  {
    path: 'arcade/play',
    loadComponent: () =>
      import('./pages/quiz/quiz.page').then((m) => m.QuizPage),
  },
  {
    path: 'arcade',
    loadComponent: () =>
      import('./pages/arcade/arcade.page').then((m) => m.ArcadePage),
  },
  {
    path: 'daily-challenge',
    loadComponent: () =>
      import('./pages/quiz/quiz.page').then((m) => m.QuizPage),
  },
  {
    path: 'levels/:categoryId/:difficultyId',
    loadComponent: () =>
      import('./pages/levels/levels.page').then((m) => m.LevelsPage),
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
