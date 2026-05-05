import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Observable } from 'rxjs';
import { User } from 'firebase/auth';

import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage {
  user$: Observable<User | null> = this.auth.user$;

  joinDate = 'Giocatore da Maggio 2025';

  level = 3;
  title = 'Quiz Master';
  currentXp = 620;
  maxXp = 1000;

  selectedAvatar = localStorage.getItem('profile_avatar') || 'letter';
  tempSelectedAvatar = this.selectedAvatar;
  showAvatarModal = false;

  avatars = [
    { id: 'letter', label: 'Iniziale', minLevel: 1 },
    { id: 'crown', label: 'Corona', icon: '👑', minLevel: 3 },
    { id: 'brain', label: 'Genio', icon: '🧠', minLevel: 5 },
    { id: 'trophy', label: 'Campione', icon: '🏆', minLevel: 10 },
  ];

  stats = [
    { icon: '🏆', value: '125', label: 'Quiz giocati' },
    { icon: '🎯', value: '68%', label: '% corrette' },
    { icon: '🔥', value: '7', label: 'Giorni di streak' },
    { icon: '⭐', value: '9/10', label: 'Miglior punteggio' },
  ];

  achievements = [
    {
      icon: '🏆',
      title: 'Perfetto!',
      description: 'Fai 10/10 in un quiz',
      completed: true,
      progress: '',
    },
    {
      icon: '🎯',
      title: 'Costante',
      description: 'Gioca per 3 giorni di fila',
      completed: true,
      progress: '',
    },
    {
      icon: '⚡',
      title: 'Veloce',
      description: 'Rispondi in meno di 10s',
      completed: true,
      progress: '',
    },
    {
      icon: '🔒',
      title: 'Esperto',
      description: 'Gioca 100 quiz',
      completed: false,
      progress: '125/100',
    },
  ];

  recentResults = [
    {
      icon: '🧠',
      category: 'Scienze',
      meta: '15 Mag 2025 • 10 domande',
      score: '8/10',
      className: 'good',
    },
    {
      icon: '⚽',
      category: 'Sport',
      meta: '15 Mag 2025 • 10 domande',
      score: '7/10',
      className: 'medium',
    },
    {
      icon: '🎬',
      category: 'Cinema',
      meta: '14 Mag 2025 • 10 domande',
      score: '9/10',
      className: 'good',
    },
  ];

  constructor(private auth: AuthService) {}

  getPlayerName(user: User | null): string {
    if (!user || user.isAnonymous) return 'Giocatore';
    return user.displayName?.split(' ')[0] || 'Giocatore';
  }

  getAvatarLetter(user: User | null): string {
    return this.getPlayerName(user).charAt(0).toUpperCase();
  }

  getSelectedAvatarIcon(user: User | null): string {
    return this.getAvatarIcon(this.selectedAvatar, user);
  }

  getAvatarIcon(avatarId: string, user: User | null): string {
    const avatar = this.avatars.find((a) => a.id === avatarId);

    if (!avatar || avatar.id === 'letter') {
      return this.getAvatarLetter(user);
    }

    return avatar.icon || this.getAvatarLetter(user);
  }

  isAvatarUnlocked(minLevel: number): boolean {
    return this.level >= minLevel;
  }

  openAvatarModal() {
    this.tempSelectedAvatar = this.selectedAvatar;
    this.showAvatarModal = true;
  }

  closeAvatarModal() {
    this.showAvatarModal = false;
    this.tempSelectedAvatar = this.selectedAvatar;
  }

  chooseTempAvatar(avatarId: string) {
    const avatar = this.avatars.find((a) => a.id === avatarId);

    if (!avatar || !this.isAvatarUnlocked(avatar.minLevel)) return;

    this.tempSelectedAvatar = avatarId;
  }

  saveAvatar() {
    this.selectedAvatar = this.tempSelectedAvatar;
    localStorage.setItem('profile_avatar', this.selectedAvatar);
    this.showAvatarModal = false;
  }

  get xpPercent(): number {
    return Math.min(100, Math.round((this.currentXp / this.maxXp) * 100));
  }
}
