import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
} from '@angular/core';
import {
  Firestore,
  doc,
  serverTimestamp,
  runTransaction,
  collection,
  addDoc,
  collectionData,
  query,
  orderBy,
  limit,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

import { QuizHistoryItem, UserStats } from 'src/app/models/user-stats.model';
import { DifficultyId } from 'src/app/models/difficulty.model';
import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';
import { getLevelFromXp } from 'src/app/utils/level-progress.util';
import { ProgressService } from './progress.service';

@Injectable({
  providedIn: 'root',
})
export class UserQuizDataService {
  private firestore = inject(Firestore);
  private progressService = inject(ProgressService);
  private injector = inject(EnvironmentInjector);

  readonly defaultStats: UserStats = {
    quizPlayed: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    bestScore: 0,
    streakDays: 0,
    xp: 0,
    level: USER_STATS_CONFIG.defaultLevel,
    levelRewardLastClaimedLevel: USER_STATS_CONFIG.defaultLevel,
    coins: USER_STATS_CONFIG.defaultCoins,
    lives: USER_STATS_CONFIG.defaultLives,
    lastQuizPlayedAt: null,
  };

  private getStartOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private getStartOfYesterday(): Date {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return yesterday;
  }

  async recordQuizResult(
    uid: string,
    correctAnswers: number,
    totalQuestions: number,
    /*
     * Se presente, marca anche il livello come completato nella STESSA
     * transazione. Prima erano due scritture separate (recordQuizResult poi
     * progressService.completeLevel): un errore di rete tra le due lasciava
     * XP/monete gia' accreditate ma il livello non completato, quindi
     * rigiocabile per incassare di nuovo lo stesso premio. Bug reale trovato
     * il 2026-08-20.
     */
    levelCompletion?: {
      categoryId: string;
      difficultyId: DifficultyId;
      levelNumber: number;
    },
  ): Promise<void> {
    const levelRef = levelCompletion
      ? doc(
          this.firestore,
          `users/${uid}/completedLevels/${this.progressService.getLevelId(
            levelCompletion.categoryId,
            levelCompletion.difficultyId,
            levelCompletion.levelNumber,
          )}`,
        )
      : null;

    await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const userRef = doc(this.firestore, `users/${uid}`);
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return;

        const data = snapshot.data();
        const stats = data['stats'];

        const currentBestScore = stats?.bestScore ?? 0;
        const currentXp = stats?.xp ?? 0;
        const currentQuizPlayed =
          typeof stats?.quizPlayed === 'number' ? stats.quizPlayed : 0;
        const currentCorrectAnswers =
          typeof stats?.correctAnswers === 'number' ? stats.correctAnswers : 0;
        const currentWrongAnswers =
          typeof stats?.wrongAnswers === 'number' ? stats.wrongAnswers : 0;
        const currentStreakDays = stats?.streakDays ?? 0;
        const lastQuizPlayedAt = stats?.lastQuizPlayedAt;
        const todayStart = this.getStartOfToday();
        const yesterdayStart = this.getStartOfYesterday();

        let updatedStreakDays = currentStreakDays;

        if (!lastQuizPlayedAt?.toDate) {
          updatedStreakDays = 1;
        } else {
          const lastPlayedDate = lastQuizPlayedAt.toDate();
          lastPlayedDate.setHours(0, 0, 0, 0);

          if (lastPlayedDate.getTime() === todayStart.getTime()) {
            updatedStreakDays = currentStreakDays;
          } else if (lastPlayedDate.getTime() === yesterdayStart.getTime()) {
            updatedStreakDays = currentStreakDays + 1;
          } else {
            updatedStreakDays = 1;
          }
        }

        const xpEarned = correctAnswers * USER_STATS_CONFIG.xpPerCorrectAnswer;
        const updatedXp = currentXp + xpEarned;
        const wrongAnswers = Math.max(0, totalQuestions - correctAnswers);

        const updatedLevel = getLevelFromXp(updatedXp);

        /*
         * Qui evitiamo increment() e serverTimestamp(): siamo gia dentro una
         * transaction e possiamo salvare i valori finali. In questo modo le
         * Firestore Rules riescono a validare davvero la transizione del quiz.
         */
        transaction.update(userRef, {
          'stats.quizPlayed': currentQuizPlayed + 1,
          'stats.correctAnswers': currentCorrectAnswers + correctAnswers,
          'stats.wrongAnswers': currentWrongAnswers + wrongAnswers,
          'stats.xp': updatedXp,
          'stats.level': updatedLevel,
          'stats.bestScore': Math.max(currentBestScore, correctAnswers),
          'stats.streakDays': updatedStreakDays,
          'stats.lastQuizPlayedAt': new Date(),
        });

        if (levelRef && levelCompletion) {
          transaction.set(
            levelRef,
            {
              categoryId: levelCompletion.categoryId,
              difficultyId: levelCompletion.difficultyId,
              levelNumber: levelCompletion.levelNumber,
              completedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      }),
    );
  }

  async recordQuizHistory(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
    correctAnswers: number,
    totalQuestions: number,
  ): Promise<void> {
    const historyRef = collection(this.firestore, `users/${uid}/quizHistory`);

    await this.runFirestore(() =>
      addDoc(historyRef, {
        categoryId,
        difficultyId,
        correctAnswers,
        totalQuestions,
        playedAt: serverTimestamp(),
      }),
    );
  }

  getRecentQuizHistory(
    uid: string,
    maxResults: number = 5,
  ): Observable<QuizHistoryItem[]> {
    const historyRef = collection(this.firestore, `users/${uid}/quizHistory`);

    const historyQuery = query(
      historyRef,
      orderBy('playedAt', 'desc'),
      limit(maxResults),
    );

    return this.runFirestore(() =>
      collectionData(historyQuery, {
        idField: 'id',
      }),
    ) as Observable<QuizHistoryItem[]>;
  }

  async addXp(uid: string, amount: number): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);

    await this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return;

        const data = snapshot.data();
        const currentXp =
          typeof data['stats']?.xp === 'number'
            ? data['stats'].xp
            : this.defaultStats.xp;

        const updatedXp = currentXp + amount;
        const updatedLevel = getLevelFromXp(updatedXp);

        transaction.update(userRef, {
          'stats.xp': updatedXp,
          'stats.level': updatedLevel,
        });
      }),
    );
  }

  /*
   * Raddoppia l'XP di un livello quiz normale appena completato, dopo un
   * video rewarded. A differenza di ruota/sfida giornaliera (che hanno un
   * flag "gia' raddoppiato" lato Firestore), prima questo raddoppio si
   * fidava solo di un booleano client: chiamando il servizio direttamente
   * (o con timing sfortunato) si poteva raddoppiare piu' volte lo stesso
   * premio. Il documento completedLevels/{levelId} puo' essere creato una
   * sola volta per livello (vedi recordQuizResult), quindi e' il posto
   * naturale per un flag "xpDoubled" analogo a lastSpinDoubled/
   * rewardDoubledDate: consumabile una sola volta per livello, per sempre.
   */
  async raddoppiaXpLivelloCompletato(
    uid: string,
    categoryId: string,
    difficultyId: DifficultyId,
    levelNumber: number,
    xpBonus: number,
  ): Promise<number> {
    if (xpBonus <= 0) return 0;

    const userRef = doc(this.firestore, `users/${uid}`);
    const levelRef = doc(
      this.firestore,
      `users/${uid}/completedLevels/${this.progressService.getLevelId(
        categoryId,
        difficultyId,
        levelNumber,
      )}`,
    );

    return this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const userSnapshot = await transaction.get(userRef);
        const levelSnapshot = await transaction.get(levelRef);

        if (!userSnapshot.exists() || !levelSnapshot.exists()) return 0;
        if (levelSnapshot.data()?.['xpDoubled']) return 0;

        const stats = userSnapshot.data()['stats'];
        const currentXp =
          typeof stats?.xp === 'number' ? stats.xp : this.defaultStats.xp;
        const updatedXp = currentXp + xpBonus;

        transaction.update(userRef, {
          'stats.xp': updatedXp,
          'stats.level': getLevelFromXp(updatedXp),
        });

        transaction.set(levelRef, { xpDoubled: true }, { merge: true });

        return xpBonus;
      }),
    );
  }

  async claimLevelUpCoinsReward(
    uid: string,
    previousLevel: number,
    currentLevel: number,
    requestedCoinsReward: number,
  ): Promise<number> {
    if (currentLevel <= previousLevel || requestedCoinsReward <= 0) return 0;

    const userRef = doc(this.firestore, `users/${uid}`);

    return this.runFirestore(() =>
      runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(userRef);

        if (!snapshot.exists()) return 0;

        const data = snapshot.data();
        const stats = data['stats'];
        const currentCoins =
          typeof stats?.coins === 'number'
            ? stats.coins
            : this.defaultStats.coins;
        const lastClaimedLevel =
          typeof stats?.levelRewardLastClaimedLevel === 'number'
            ? stats.levelRewardLastClaimedLevel
            : previousLevel;
        /*
         * NON fare Math.max(lastClaimedLevel, previousLevel): previousLevel
         * e' solo il livello di partenza di QUESTA chiamata, non
         * necessariamente l'ultimo davvero riscosso. Se un secondo level-up
         * scatta prima che il primo sia stato riscosso (es. l'utente guarda
         * un video e raddoppia XP subito dopo un level-up da quiz, prima di
         * toccare "Continua"), previousLevel qui e' gia' il livello del
         * PRIMO level-up non riscosso: usarlo come floor avrebbe scartato in
         * silenzio il premio in monete di quel livello intermedio. Bug reale
         * trovato il 2026-08-20.
         */
        const rewardFromLevel = lastClaimedLevel;
        const levelsToReward = Math.max(0, currentLevel - rewardFromLevel);

        if (levelsToReward <= 0) {
          transaction.update(userRef, {
            'stats.levelRewardLastClaimedLevel': Math.max(
              lastClaimedLevel,
              currentLevel,
            ),
          });

          return 0;
        }

        const coinsReward =
          levelsToReward * USER_STATS_CONFIG.levelUpCoinsReward;
        const doubledCoinsReward = coinsReward * 2;
        const safeCoinsReward =
          requestedCoinsReward >= doubledCoinsReward
            ? doubledCoinsReward
            : coinsReward;

        transaction.update(userRef, {
          'stats.coins': currentCoins + safeCoinsReward,
          'stats.levelRewardLastClaimedLevel': currentLevel,
        });

        return safeCoinsReward;
      }),
    );
  }

  private runFirestore<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
