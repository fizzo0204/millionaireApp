import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private music?: HTMLAudioElement;
  private musicEnabled = true;
  private readonly MUSIC_ENABLED_KEY = 'music_enabled';
  private fadeInterval?: ReturnType<typeof setInterval>;

  constructor() {
    const saved = localStorage.getItem(this.MUSIC_ENABLED_KEY);

    if (saved !== null) {
      this.musicEnabled = saved === 'true';
    }
  }

  initHomeMusic() {
    if (this.music) return;

    this.music = new Audio('assets/audio/homeMusic.mp3');
    this.music.loop = true;
    this.music.volume = 0;
  }

  async playMusic() {
    if (!this.musicEnabled) return;

    if (!this.music) {
      this.initHomeMusic();
    }

    if (!this.music || !this.music.paused) return;

    try {
      await this.music.play();
      this.fadeIn();
    } catch {
      console.log('🎵 Autoplay bloccato: serve un tap utente');
    }
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    localStorage.setItem(this.MUSIC_ENABLED_KEY, String(enabled));

    if (!enabled) {
      this.stopMusic();
    }
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  stopMusic() {
    if (!this.music) return;

    this.music.pause();
    this.music.currentTime = 0;
  }

  isPlaying(): boolean {
    return !!this.music && !this.music.paused;
  }

  private fadeIn(targetVolume = 0.35, duration = 1200) {
    if (!this.music) return;

    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
    }

    const steps = 20;
    const stepTime = duration / steps;
    const volumeStep = targetVolume / steps;

    this.music.volume = 0;

    this.fadeInterval = setInterval(() => {
      if (!this.music) return;

      const nextVolume = Math.min(targetVolume, this.music.volume + volumeStep);
      this.music.volume = nextVolume;

      if (nextVolume >= targetVolume && this.fadeInterval) {
        clearInterval(this.fadeInterval);
        this.fadeInterval = undefined;
      }
    }, stepTime);
  }
}
