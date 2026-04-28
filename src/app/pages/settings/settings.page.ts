import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioService } from 'src/app/services/audio';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {
  musicEnabled = true;

  constructor(private audioService: AudioService) {
    this.musicEnabled = this.audioService.isMusicEnabled();
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;

    this.audioService.setMusicEnabled(this.musicEnabled);
  }
}
