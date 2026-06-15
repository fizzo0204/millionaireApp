import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  DAILY_EVENTS_CONFIG,
  DAILY_WHEEL_REWARDS,
} from 'src/app/config/daily-events.config';
import { STORAGE_KEYS } from 'src/app/config/storage-keys.config';
import {
  DailyEventsData,
  DailyMissionConfig,
  DailyMissionMetric,
  DailyMissionView,
  DailyWheelRewardResult,
} from 'src/app/models/daily-events.model';
import { AdsService } from './ads.service';
import { DailyEventGamesService } from './daily-event-games.service';
import { DailyMissionService } from './daily-mission.service';

@Injectable({
  providedIn: 'root',
})
export class DailyEventsService {
  private ads = inject(AdsService);
  private dailyMissionService = inject(DailyMissionService);
  private dailyEventGamesService = inject(DailyEventGamesService);

  private rewardedAdProgressQueue = Promise.resolve();
  private dailyNotificationCountSubject = new BehaviorSubject(0);
  private dayChangedSubject = new Subject<void>();

  readonly dailyNotificationCount$ =
    this.dailyNotificationCountSubject.asObservable();
  readonly dayChanged$ = this.dayChangedSubject.asObservable();
  readonly wheelRewards = DAILY_WHEEL_REWARDS;
  readonly dailyChallengeQuestionCount =
    DAILY_EVENTS_CONFIG.dailyChallengeQuestionCount;
  readonly dailyChallengeCoinsReward =
    DAILY_EVENTS_CONFIG.dailyChallengeCoinsReward;

  constructor() {
    /*
     * Ogni rewarded video completato conta per la missione fissa giornaliera.
     * Cosi vale sia se il video parte da Eventi, sia se parte da quiz/shop/home.
     */
    this.ads.rewardedAdCompleted$.subscribe(() => {
      this.rewardedAdProgressQueue = this.rewardedAdProgressQueue
        .catch(() => undefined)
        .then(() => this.trackRewardedAdCompleted())
        .catch((error) => {
          console.warn('Missione video non aggiornata:', error);
        });
    });
  }

  // Recupera il piano missioni previsto per il giorno corrente.
  getTodayPlan(): DailyMissionConfig[] {
    return this.dailyMissionService.getTodayPlan();
  }

  // Recupera le missioni giornaliere già risolte con progressi, claim e switch.
  async getTodayMissions(): Promise<DailyMissionView[]> {
    const result = await this.dailyMissionService.getTodayMissions();
    this.updateNotificationCount(result.notificationCount);

    return result.missions;
  }

  // Recupera i dati dailyEvents dell'utente corrente oppure il default se non loggato.
  async getTodayDataForCurrentUser(): Promise<DailyEventsData> {
    return this.dailyMissionService.getTodayDataForCurrentUser();
  }

  // Sincronizza i dati giornalieri e aggiorna il badge notifiche.
  async syncTodayDataForCurrentUser(): Promise<void> {
    const result = await this.dailyMissionService.syncTodayDataForCurrentUser();

    this.updateNotificationCount(result.notificationCount);

    if (result.dayChanged) {
      this.dayChangedSubject.next();
    }
  }

  // Ricalcola il numero di notifiche daily visibili nella UI.
  async refreshNotificationCount(): Promise<void> {
    await this.syncTodayDataForCurrentUser();
  }

  // Indica se la ruota ha ancora il giro gratuito disponibile.
  isWheelFreeSpinAvailable(data: DailyEventsData | null): boolean {
    return this.dailyEventGamesService.isWheelFreeSpinAvailable(data);
  }

  // Indica se la daily challenge può ancora assegnare premio oggi.
  isDailyChallengeAvailable(data: DailyEventsData | null): boolean {
    return this.dailyEventGamesService.isDailyChallengeAvailable(data);
  }

  // Legge il giorno debug scelto nelle impostazioni, se presente.
  getDebugWeekday(): number | null {
    const savedValue = localStorage.getItem(
      STORAGE_KEYS.dailyEventsDebugWeekday,
    );

    if (savedValue === null) return null;

    const weekday = Number(savedValue);

    return Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
      ? weekday
      : null;
  }

  // Imposta o rimuove il giorno debug delle missioni giornaliere.
  async setDebugWeekday(weekday: number | null): Promise<void> {
    if (weekday === null) {
      localStorage.removeItem(STORAGE_KEYS.dailyEventsDebugWeekday);
      await this.resetDailyEventsDebug();
      return;
    }

    const safeWeekday = Math.min(Math.max(Math.floor(weekday), 0), 6);

    localStorage.setItem(
      STORAGE_KEYS.dailyEventsDebugWeekday,
      String(safeWeekday),
    );

    await this.resetDailyEventsDebug();
  }

  // Resetta tutti i dati giornalieri usati durante i test/debug.
  async resetDailyEventsDebug(): Promise<void> {
    await this.dailyMissionService.resetDailyEventsDebug();
    this.dailyNotificationCountSubject.next(0);
  }

  // Registra un controllo del daily reward nelle missioni giornaliere.
  async trackDailyRewardCheck(): Promise<void> {
    await this.trackMissionProgress('dailyRewardChecks');
  }

  // Registra l'avvio della daily challenge.
  async trackDailyChallengeStarted(): Promise<void> {
    await this.trackMissionProgress('dailyChallengeStarted', 1, 'max');
  }

  // Registra una domanda giocata nella daily challenge.
  async trackDailyChallengeQuestion(): Promise<void> {
    await this.trackMissionProgress('dailyChallengeQuestions');
  }

  // Registra una risposta corretta nella daily challenge.
  async trackDailyChallengeCorrect(): Promise<void> {
    await this.trackMissionProgress('dailyChallengeCorrect');
  }

  // Registra l'uso di un aiuto nella daily challenge.
  async trackDailyChallengeHelp(): Promise<void> {
    await this.trackMissionProgress('dailyChallengeHelps');
  }

  // Registra un quiz normale giocato.
  async trackNormalQuizPlayed(): Promise<void> {
    await this.trackMissionProgress('normalQuizPlayed');
  }

  // Registra un quiz normale vinto.
  async trackNormalQuizWon(): Promise<void> {
    await this.trackMissionProgress('normalQuizWon');
  }

  // Registra l'uso di un aiuto in un quiz normale.
  async trackNormalHelpUsed(): Promise<void> {
    await this.trackMissionProgress('normalHelpsUsed');
  }

  // Registra il completamento di un livello normale.
  async trackNormalLevelCompleted(): Promise<void> {
    await this.trackMissionProgress('normalLevelsCompleted');
  }

  // Cambia una missione giornaliera con una missione alternativa valida.
  async switchDailyMission(
    originalMissionId: string,
  ): Promise<DailyMissionConfig | null> {
    const result =
      await this.dailyMissionService.switchDailyMission(originalMissionId);

    if (result.notificationCount !== null) {
      this.updateNotificationCount(result.notificationCount);
    }

    return result.replacement;
  }

  // Aggiorna il progresso di una metrica missione.
  async trackMissionProgress(
    metric: DailyMissionMetric,
    amount = 1,
    mode: 'increment' | 'max' = 'increment',
  ): Promise<void> {
    const result = await this.dailyMissionService.trackMissionProgress(
      metric,
      amount,
      mode,
    );

    if (result.notificationCount !== null) {
      this.updateNotificationCount(result.notificationCount);
    }
  }

  // Riscatta il premio di una missione completata.
  // Restituisce anche l'eventuale premio finale 7/7.
  async claimMissionReward(missionId: string): Promise<{
    rewardCoins: number;
    finalRewardCoins: number;
    finalRewardClaimed: boolean;
  }> {
    const result = await this.dailyMissionService.claimMissionReward(missionId);

    if (result.notificationCount !== null) {
      this.updateNotificationCount(result.notificationCount);
    }

    return {
      rewardCoins: result.rewardCoins,
      finalRewardCoins: result.finalRewardCoins,
      finalRewardClaimed: result.finalRewardClaimed,
    };
  }

  // Controlla e assegna il premio finale missioni se tutte le missioni
  // erano gia state riscattate prima dell'apertura della pagina.
  async claimFinalMissionsRewardIfAvailable(): Promise<{
    finalRewardCoins: number;
    finalRewardClaimed: boolean;
  }> {
    const result =
      await this.dailyMissionService.claimFinalMissionsRewardIfAvailable();

    if (result.notificationCount !== null) {
      this.updateNotificationCount(result.notificationCount);
    }

    return {
      finalRewardCoins: result.finalRewardCoins,
      finalRewardClaimed: result.finalRewardClaimed,
    };
  }

  // Esegue un giro della ruota eventi.
  async spinWheel(useAdSpin: boolean): Promise<DailyWheelRewardResult | null> {
    if (useAdSpin) {
      await this.waitForRewardedAdProgress();
    }

    const result = await this.dailyEventGamesService.spinWheel(useAdSpin);

    if (result.notificationCount !== null) {
      this.updateNotificationCount(result.notificationCount);
    }

    return result.reward;
  }

  // Raddoppia il premio della ruota dopo il video reward.
  async doubleWheelReward(
    wheelReward: DailyWheelRewardResult,
  ): Promise<DailyWheelRewardResult | null> {
    await this.waitForRewardedAdProgress();

    return this.dailyEventGamesService.doubleWheelReward(wheelReward);
  }

  // Completa la daily challenge e assegna il premio se disponibile.
  async completeDailyChallenge(
    correctAnswers: number,
    totalQuestions: number,
    helpsUsed: number,
  ): Promise<{ rewardCoins: number; alreadyClaimed: boolean }> {
    const result = await this.dailyEventGamesService.completeDailyChallenge(
      correctAnswers,
      totalQuestions,
      helpsUsed,
    );

    if (result.notificationCount !== null) {
      this.updateNotificationCount(result.notificationCount);
    }

    return {
      rewardCoins: result.rewardCoins,
      alreadyClaimed: result.alreadyClaimed,
    };
  }

  // Raddoppia il premio della daily challenge dopo il video reward.
  async doubleDailyChallengeReward(): Promise<number> {
    await this.waitForRewardedAdProgress();

    return this.dailyEventGamesService.doubleDailyChallengeReward();
  }

  // Aggiorna la missione collegata ai rewarded video completati.
  private async trackRewardedAdCompleted(): Promise<void> {
    const result = await this.dailyMissionService.trackRewardedAdCompleted();

    if (result.notificationCount !== null) {
      this.updateNotificationCount(result.notificationCount);
    }
  }

  // Aspetta che la missione video abbia finito di aggiornarsi prima di proseguire.
  private async waitForRewardedAdProgress(): Promise<void> {
    await this.rewardedAdProgressQueue.catch(() => undefined);
  }

  // Aggiorna il badge notifiche degli eventi giornalieri.
  private updateNotificationCount(count: number): void {
    this.dailyNotificationCountSubject.next(count);
  }
}
