import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private music?: HTMLAudioElement;
  private clickPool: HTMLAudioElement[] = [];
  private clickIndex = 0;
  private readonly CLICK_POOL_SIZE = 5;

  private clickEnabled = true;
  private readonly CLICK_ENABLED_KEY = 'click_enabled';

  private musicEnabled = true;
  private readonly MUSIC_ENABLED_KEY = 'music_enabled';

  private fadeInterval?: ReturnType<typeof setInterval>;
  private isStartingMusic = false;

  constructor() {
    const clickSaved = localStorage.getItem(this.CLICK_ENABLED_KEY);

    if (clickSaved !== null) {
      this.clickEnabled = clickSaved === 'true';
    }

    const saved = localStorage.getItem(this.MUSIC_ENABLED_KEY);

    if (saved !== null) {
      this.musicEnabled = saved === 'true';
    }

    this.initClickSound();
  }

  initHomeMusic() {
    if (this.music) return;

    this.music = new Audio('assets/audio/homeMusic.m4a');

    this.music.setAttribute('playsinline', 'true');
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.volume = 0;

    this.music.load();
  }

  private initClickSound() {
    if (this.clickPool.length > 0) return;

    this.clickPool = Array.from({ length: this.CLICK_POOL_SIZE }, () => {
      const audio = new Audio('assets/audio/click.m4a');
      audio.volume = 0.5;
      audio.preload = 'auto';
      return audio;
    });
  }

  async playMusic(): Promise<boolean> {
    if (!this.musicEnabled) return false;

    if (this.isStartingMusic) return false;

    if (!this.music) {
      this.initHomeMusic();
    }

    if (!this.music) return false;

    if (!this.music.paused) return true;

    this.isStartingMusic = true;

    try {
      await this.music.play();

      if (this.music.volume === 0) {
        this.fadeIn();
      } else {
        this.music.volume = 0.35;
      }

      return true;
    } catch {
      console.log('🎵 Autoplay bloccato');
      return false;
    } finally {
      this.isStartingMusic = false;
    }
  }

  playClick() {
    if (!this.clickEnabled) return;

    this.initClickSound();

    const sound = this.clickPool[this.clickIndex];
    this.clickIndex = (this.clickIndex + 1) % this.CLICK_POOL_SIZE;

    if (!sound) return;

    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  setClickEnabled(enabled: boolean) {
    this.clickEnabled = enabled;
    localStorage.setItem(this.CLICK_ENABLED_KEY, String(enabled));
  }

  isClickEnabled(): boolean {
    return this.clickEnabled;
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    localStorage.setItem(this.MUSIC_ENABLED_KEY, String(enabled));

    if (enabled) {
      this.playMusic();
    } else {
      this.stopMusic();
    }
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  pauseMusic() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = undefined;
    }

    if (!this.music) return;

    this.music.pause();
  }

  stopMusic() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = undefined;
    }

    if (!this.music) return;

    this.music.pause();
    this.music.currentTime = 0;
    this.music.volume = 0.35;
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
