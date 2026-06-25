import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { CoinsService } from './coins.service';
import { UserStatsService } from './user-stats.service';
import { UserAvatarDataService } from './user-avatar-data.service';

import { AvatarModel, AvatarSource } from 'src/app/models/avatar.model';
import { AVATARS } from '../data/avatars.data';

export type TipoForziere = 'viaggiatore' | 'maestro' | 'leggendario';

export interface ConfigForziere {
  tipo: TipoForziere;
  productId: string;
  titolo: string;
  prezzo: string;
  coins: number;
  xp: number;
  avatarSource?: AvatarSource;
  fallbackCoins?: number;
}

export interface AnteprimaForziere {
  config: ConfigForziere;
  avatarDisponibili: number;
  avatarTotali: number;
  haAvatarGarantito: boolean;
  usaFallbackCoins: boolean;
  coinsFinali: number;
  xpFinali: number;
}

export interface RisultatoForziere {
  coins: number;
  xp: number;
  avatar?: AvatarModel;
  fallbackUsato: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ShopService {
  private auth = inject(AuthService);
  private coinsService = inject(CoinsService);
  private userStatsService = inject(UserStatsService);
  private userAvatarDataService = inject(UserAvatarDataService);

  readonly forzieri: ConfigForziere[] = [
    {
      tipo: 'viaggiatore',
      productId: 'chest_traveler_199',
      titolo: 'Forziere del Viaggiatore',
      prezzo: '€1,99',
      coins: 50,
      xp: 50,
    },
    {
      tipo: 'maestro',
      productId: 'chest_master_299',
      titolo: 'Forziere del Maestro',
      prezzo: '€2,99',
      coins: 150,
      xp: 150,
      avatarSource: 'daily',
      fallbackCoins: 300,
    },
    {
      tipo: 'leggendario',
      productId: 'chest_legendary_499',
      titolo: 'Forziere Leggendario',
      prezzo: '€4,99',
      coins: 400,
      xp: 400,
      avatarSource: 'epic',
      fallbackCoins: 800,
    },
  ];

  // Recupera la configurazione del forziere richiesto.
  getForziere(tipo: TipoForziere): ConfigForziere {
    const config = this.forzieri.find((item) => item.tipo === tipo);

    if (!config) {
      throw new Error(`Forziere non trovato: ${tipo}`);
    }

    return config;
  }

  // Prepara i dati prima dell'acquisto, così possiamo avvisare l'utente se ha già tutti gli avatar.
  async preparaAnteprimaForziere(
    tipo: TipoForziere,
  ): Promise<AnteprimaForziere> {
    const config = this.getForziere(tipo);
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      throw new Error('Utente non autenticato');
    }

    if (!config.avatarSource) {
      return {
        config,
        avatarDisponibili: 0,
        avatarTotali: 0,
        haAvatarGarantito: false,
        usaFallbackCoins: false,
        coinsFinali: config.coins,
        xpFinali: config.xp,
      };
    }

    const avatarData = await this.userAvatarDataService.getAvatarData(user.uid);
    const avatarTotali = this.getAvatarPerSource(config.avatarSource);
    const avatarDisponibili = avatarTotali.filter(
      (avatar) => !avatarData.unlockedAvatarIds.includes(avatar.id),
    );

    const usaFallbackCoins = avatarDisponibili.length === 0;

    return {
      config,
      avatarDisponibili: avatarDisponibili.length,
      avatarTotali: avatarTotali.length,
      haAvatarGarantito: true,
      usaFallbackCoins,
      coinsFinali: usaFallbackCoins
        ? (config.fallbackCoins ?? config.coins)
        : config.coins,
      xpFinali: config.xp,
    };
  }

  // Completa l'acquisto e assegna coins, XP ed eventuale avatar non posseduto.
  async riscattaForziere(tipo: TipoForziere): Promise<RisultatoForziere> {
    const config = this.getForziere(tipo);
    const user = await firstValueFrom(this.auth.user$);

    if (!user) {
      throw new Error('Utente non autenticato');
    }

    let avatarSbloccato: AvatarModel | undefined;
    let fallbackUsato = false;
    let coinsDaAggiungere = config.coins;

    if (config.avatarSource) {
      const avatarData = await this.userAvatarDataService.getAvatarData(
        user.uid,
      );

      const avatarDisponibili = this.getAvatarPerSource(
        config.avatarSource,
      ).filter((avatar) => !avatarData.unlockedAvatarIds.includes(avatar.id));

      if (avatarDisponibili.length > 0) {
        avatarSbloccato = this.estraiAvatarCasuale(avatarDisponibili);

        await this.userAvatarDataService.updateAvatarData(user.uid, {
          unlockedAvatarIds: [
            ...avatarData.unlockedAvatarIds,
            avatarSbloccato.id,
          ],
        });
      } else {
        fallbackUsato = true;
        coinsDaAggiungere = config.fallbackCoins ?? config.coins;
      }
    }

    await this.coinsService.addCoins(coinsDaAggiungere);
    await this.userStatsService.addXp(user.uid, config.xp);

    return {
      coins: coinsDaAggiungere,
      xp: config.xp,
      avatar: avatarSbloccato,
      fallbackUsato,
    };
  }

  // Restituisce solo gli avatar della tipologia richiesta.
  private getAvatarPerSource(source: AvatarSource): AvatarModel[] {
    return AVATARS.filter((avatar) => avatar.source === source);
  }

  // Estrae un avatar casuale tra quelli disponibili.
  private estraiAvatarCasuale(avatars: AvatarModel[]): AvatarModel {
    const index = Math.floor(Math.random() * avatars.length);
    return avatars[index];
  }
}
