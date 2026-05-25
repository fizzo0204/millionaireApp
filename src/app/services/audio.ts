import { Injectable } from '@angular/core';
import { AUDIO_CONFIG } from '../config/audio.config';
import { STORAGE_KEYS } from 'src/app/config/storage-keys.config';

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private music?: HTMLAudioElement;
  private activeGameSound?: HTMLAudioElement;
  private countdownQuizSound?: HTMLAudioElement;
  private finishTimeSound?: HTMLAudioElement;
  private errorQuizSound?: HTMLAudioElement;
  private correctQuizSound?: HTMLAudioElement;
  private clickPool: HTMLAudioElement[] = [];

  private clickIndex = 0;
  private readonly CLICK_POOL_SIZE = 5;
  private readonly BACKGROUND_VOLUME = 0.35;
  private readonly FADE_IN_DURATION = 1200;

  private clickEnabled = true;
  private musicEnabled = true;
  private isStartingMusic = false;
  private musicSuspendedByGame = false;

  private fadeInterval?: ReturnType<typeof setInterval>;
  private gameSoundFadeInterval?: ReturnType<typeof setInterval>;

  constructor() {
    const clickSaved = localStorage.getItem(STORAGE_KEYS.clickEnabled);

    if (clickSaved !== null) {
      this.clickEnabled = clickSaved === 'true';
    }

    const saved = localStorage.getItem(STORAGE_KEYS.musicEnabled);

    if (saved !== null) {
      this.musicEnabled = saved === 'true';
    }

    this.initClickSound();
  }

  initHomeMusic() {
    if (this.music) return;

    this.music = new Audio(AUDIO_CONFIG.music.home);
    this.music.setAttribute('playsinline', 'true');
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.volume = 0;
    this.music.load();
  }

  private initClickSound() {
    if (this.clickPool.length > 0) return;

    this.clickPool = Array.from({ length: this.CLICK_POOL_SIZE }, () => {
      const audio = new Audio(AUDIO_CONFIG.sounds.click);
      audio.volume = 0.5;
      audio.preload = 'auto';
      return audio;
    });
  }

  private getCountdownQuizSound(): HTMLAudioElement {
    if (!this.countdownQuizSound) {
      this.countdownQuizSound = new Audio(AUDIO_CONFIG.sounds.countdownQuiz);
      this.countdownQuizSound.setAttribute('playsinline', 'true');
      this.countdownQuizSound.preload = 'auto';
      this.countdownQuizSound.volume = this.BACKGROUND_VOLUME;
      this.countdownQuizSound.onended = () => {
        if (this.activeGameSound === this.countdownQuizSound) {
          this.activeGameSound = undefined;
        }
      };
      this.countdownQuizSound.load();
    }

    return this.countdownQuizSound;
  }

  private getFinishTimeSound(): HTMLAudioElement {
    if (!this.finishTimeSound) {
      this.finishTimeSound = new Audio(AUDIO_CONFIG.sounds.finishTime);
      this.finishTimeSound.setAttribute('playsinline', 'true');
      this.finishTimeSound.preload = 'auto';
      this.finishTimeSound.volume = this.BACKGROUND_VOLUME;
      this.finishTimeSound.onended = () => {
        if (this.activeGameSound === this.finishTimeSound) {
          this.activeGameSound = undefined;
        }
      };
      this.finishTimeSound.load();
    }

    return this.finishTimeSound;
  }

  private getErrorQuizSound(): HTMLAudioElement {
    if (!this.errorQuizSound) {
      this.errorQuizSound = new Audio(AUDIO_CONFIG.sounds.errorQuiz);
      this.errorQuizSound.setAttribute('playsinline', 'true');
      this.errorQuizSound.preload = 'auto';
      this.errorQuizSound.volume = this.BACKGROUND_VOLUME;
      this.errorQuizSound.onended = () => {
        if (this.activeGameSound === this.errorQuizSound) {
          this.activeGameSound = undefined;
        }
      };
      this.errorQuizSound.load();
    }

    return this.errorQuizSound;
  }

  private getCorrectQuizSound(): HTMLAudioElement {
    if (!this.correctQuizSound) {
      this.correctQuizSound = new Audio(AUDIO_CONFIG.sounds.correctQuiz);
      this.correctQuizSound.setAttribute('playsinline', 'true');
      this.correctQuizSound.preload = 'auto';
      this.correctQuizSound.volume = this.BACKGROUND_VOLUME;
      this.correctQuizSound.onended = () => {
        if (this.activeGameSound === this.correctQuizSound) {
          this.activeGameSound = undefined;
        }
      };
      this.correctQuizSound.load();
    }

    return this.correctQuizSound;
  }

  async playMusic(): Promise<boolean> {
    if (!this.musicEnabled) return false;
    if (this.musicSuspendedByGame) return false;

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
        this.music.volume = this.BACKGROUND_VOLUME;
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

  playCountdownQuiz() {
    this.playGameSound(this.getCountdownQuizSound());
  }

  playFinishTime() {
    this.playGameSound(this.getFinishTimeSound());
  }

  playErrorQuiz() {
    this.playGameSound(this.getErrorQuizSound());
  }

  playCorrectQuiz() {
    this.playGameSound(this.getCorrectQuizSound());
  }

  stopGameSound() {
    this.clearGameSoundFade();

    if (!this.activeGameSound) return;

    this.activeGameSound.pause();
    this.activeGameSound.currentTime = 0;
    this.activeGameSound.volume = this.BACKGROUND_VOLUME;
    this.activeGameSound = undefined;
  }

  private playGameSound(sound: HTMLAudioElement) {
    if (!this.musicEnabled) return;

    /*
     * Gli effetti di gioco sono esclusivi: quando parte un nuovo effetto
     * interrompiamo quello precedente per evitare sovrapposizioni.
     */
    this.stopGameSound();

    this.activeGameSound = sound;
    sound.currentTime = 0;
    sound.volume = 0;
    sound
      .play()
      .then(() => {
        this.fadeInGameSound(sound);
      })
      .catch(() => {
        if (this.activeGameSound === sound) {
          this.activeGameSound = undefined;
        }

        this.clearGameSoundFade();
      });
  }

  setClickEnabled(enabled: boolean) {
    this.clickEnabled = enabled;
    localStorage.setItem(STORAGE_KEYS.clickEnabled, String(enabled));
  }

  isClickEnabled(): boolean {
    return this.clickEnabled;
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    localStorage.setItem(STORAGE_KEYS.musicEnabled, String(enabled));

    if (enabled) {
      this.playMusic();
    } else {
      this.stopGameSound();
      this.stopMusic();
    }
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  /*
   * Durante una domanda del quiz la musica di sottofondo deve restare spenta:
   * lasciamo attivi solo click e suoni di gioco, in base ai toggle utente.
   */
  suspendMusicForGame() {
    this.musicSuspendedByGame = true;
    this.pauseMusic();
  }

  resumeMusicAfterGame() {
    this.musicSuspendedByGame = false;
    return this.playMusic();
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
    this.music.volume = this.BACKGROUND_VOLUME;
  }

  isPlaying(): boolean {
    return !!this.music && !this.music.paused;
  }

  private fadeIn(
    targetVolume = this.BACKGROUND_VOLUME,
    duration = this.FADE_IN_DURATION,
  ) {
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

  private fadeInGameSound(
    sound: HTMLAudioElement,
    targetVolume = this.BACKGROUND_VOLUME,
    duration = this.FADE_IN_DURATION,
  ) {
    this.clearGameSoundFade();

    const steps = 20;
    const stepTime = duration / steps;
    const volumeStep = targetVolume / steps;

    sound.volume = 0;

    const interval = setInterval(() => {
      if (this.activeGameSound !== sound) {
        clearInterval(interval);

        if (this.gameSoundFadeInterval === interval) {
          this.gameSoundFadeInterval = undefined;
        }

        return;
      }

      const nextVolume = Math.min(targetVolume, sound.volume + volumeStep);
      sound.volume = nextVolume;

      if (nextVolume >= targetVolume) {
        clearInterval(interval);

        if (this.gameSoundFadeInterval === interval) {
          this.gameSoundFadeInterval = undefined;
        }
      }
    }, stepTime);

    this.gameSoundFadeInterval = interval;
  }

  private clearGameSoundFade() {
    if (!this.gameSoundFadeInterval) return;

    clearInterval(this.gameSoundFadeInterval);
    this.gameSoundFadeInterval = undefined;
  }
}
