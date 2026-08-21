import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';

import { NavigationTransitionService } from 'src/app/services/navigation-transition.service';
import {
  AdminUserRow,
  AdminUsersService,
} from 'src/app/services/admin-users.service';
import { AUTH_PROVIDERS } from 'src/app/data/auth-providers.data';
import { AVATARS } from 'src/app/data/avatars.data';
import { AvatarModel } from 'src/app/models/avatar.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';

const COINS_STEP = 10;

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './admin-users.page.html',
  styleUrls: ['./admin-users.page.scss'],
})
export class AdminUsersPage implements OnInit {
  private adminUsersService = inject(AdminUsersService);
  private navigation = inject(NavigationTransitionService);
  private toastCtrl = inject(ToastController);

  readonly avatars: AvatarModel[] = AVATARS;
  readonly coinsStep = COINS_STEP;

  users: AdminUserRow[] = [];
  filteredUsers: AdminUserRow[] = [];
  searchTerm = '';
  loading = true;

  menuOpen = false;
  menuEvent: Event | null = null;
  menuUser: AdminUserRow | null = null;

  avatarPickerOpen = false;

  async ngOnInit(): Promise<void> {
    await this.loadUsers();
  }

  goBack(): void {
    void this.navigation.navigateByUrl('/settings');
  }

  async loadUsers(): Promise<void> {
    this.loading = true;

    try {
      this.users = await this.adminUsersService.listUsers();
      this.applyFilter();
    } catch (error) {
      console.error('Errore caricamento utenti admin:', error);
      await this.showToast('Errore nel caricamento degli utenti');
    } finally {
      this.loading = false;
    }
  }

  onSearchChange(value: string | number | null | undefined): void {
    this.searchTerm = typeof value === 'string' ? value : '';
    this.applyFilter();
  }

  providerLabels(user: AdminUserRow): string {
    if (user.isAnonymous) return 'Ospite';

    return user.providerIds
      .filter((id) => id !== 'anonymous')
      .map((id) => AUTH_PROVIDERS[id]?.shortLabel ?? id)
      .join(', ');
  }

  formatDate(value: unknown): string {
    const date = this.toDate(value);

    if (!date) return '—';

    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  async copyUid(uid: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(uid);
      await this.showToast('UID copiato negli appunti');
    } catch (error) {
      console.error('Errore copia UID:', error);
    }
  }

  openMenu(event: Event, user: AdminUserRow): void {
    event.stopPropagation();
    this.menuUser = user;
    this.menuEvent = event;
    this.menuOpen = true;
  }

  closeMenu(): void {
    this.menuOpen = false;
    this.menuEvent = null;
    this.menuUser = null;
  }

  async addCoins(): Promise<void> {
    const user = this.menuUser;

    if (!user) return;

    try {
      const nextCoins = await this.adminUsersService.addCoins(
        user.uid,
        this.coinsStep,
      );
      user.coins = nextCoins;
    } catch (error) {
      console.error('Errore aggiunta monete admin:', error);
      await this.showToast('Errore durante l\'aggiunta delle monete');
    }
  }

  openAvatarPicker(): void {
    this.avatarPickerOpen = true;
  }

  closeAvatarPicker(): void {
    this.avatarPickerOpen = false;
  }

  isAvatarUnlocked(avatarId: string): boolean {
    return !!this.menuUser?.unlockedAvatarIds.includes(avatarId);
  }

  async unlockAvatar(avatar: AvatarModel): Promise<void> {
    const user = this.menuUser;

    if (!user || this.isAvatarUnlocked(avatar.id)) return;

    try {
      await this.adminUsersService.unlockAvatar(user.uid, avatar.id);
      user.unlockedAvatarIds = [...user.unlockedAvatarIds, avatar.id];
      await this.showToast(`Avatar "${avatar.label}" sbloccato`);
    } catch (error) {
      console.error('Errore sblocco avatar admin:', error);
      await this.showToast('Errore durante lo sblocco avatar');
    }
  }

  async confirmReset(): Promise<void> {
    const user = this.menuUser;

    if (!user) return;

    const confirmed = confirm(
      `Vuoi davvero resettare tutti i progressi di ${this.displayLabel(user)}? Livello, XP, monete, vite e cronologia torneranno a 0.`,
    );

    if (!confirmed) return;

    try {
      await this.adminUsersService.resetUser(user.uid);
      user.level = USER_STATS_CONFIG.defaultLevel;
      user.xp = 0;
      user.coins = USER_STATS_CONFIG.defaultCoins;
      user.lives = USER_STATS_CONFIG.defaultLives;
      user.unlockedAvatarIds = [];
      this.closeMenu();
      await this.showToast('Account resettato');
    } catch (error) {
      console.error('Errore reset admin:', error);
      await this.showToast('Errore durante il reset');
    }
  }

  private displayLabel(user: AdminUserRow): string {
    return user.email ?? user.nickname ?? user.displayName ?? user.uid;
  }

  private applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      this.filteredUsers = this.users;
      return;
    }

    this.filteredUsers = this.users.filter((user) =>
      [user.email, user.nickname, user.displayName, user.uid]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(term)),
    );
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2200,
      position: 'bottom',
    });

    await toast.present();
  }

  private toDate(value: unknown): Date | null {
    if (!value) return null;

    if (value instanceof Date) return value;

    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate: unknown }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate();
    }

    return null;
  }
}
