export type DailyMissionMetric =
  | 'adsWatched'
  | 'dailyRewardChecks'
  | 'wheelSpins'
  | 'normalQuizPlayed'
  | 'normalQuizWon'
  | 'normalHelpsUsed'
  | 'normalLevelsCompleted'
  | 'dailyChallengeStarted'
  | 'dailyChallengeQuestions'
  | 'dailyChallengeCorrect'
  | 'dailyChallengeCompleted'
  | 'dailyChallengeHelps'
  | 'dailyChallengePerfect'
  | 'dailyChallengeNoHelp';

export interface DailyMissionConfig {
  id: string;
  title: string;
  description: string;
  metric: DailyMissionMetric;
  target: number;
  rewardCoins: number;
}

export interface DailyMissionView extends DailyMissionConfig {
  originalMissionId: string;
  progress: number;
  claimed: boolean;
  completed: boolean;
  switched: boolean;
  canSwitch: boolean;
}

export type DailyWheelRewardType = 'coins' | 'xp' | 'baseAvatar';

export interface DailyWheelRewardConfig {
  id: string;
  label: string;
  shortLabel: string;
  type: DailyWheelRewardType;
  amount?: number;
  weight: number;
}

export interface DailyWheelRewardResult {
  reward: DailyWheelRewardConfig;
  label: string;
  doubled: boolean;
  avatarId?: string;
  avatarIcon?: string;
  avatarDuplicate?: boolean;
  convertedCoins?: number;
  amount?: number;
}

export interface DailyEventsData {
  dateKey: string;
  metrics: Partial<Record<DailyMissionMetric, number>>;
  missionClaims: Record<string, boolean>;
  missionSwitches: Record<string, string>;
  missionProgressBaselines: Record<string, number>;
  wheel: {
    freeSpinDate: string | null;
    lastFreeSpinAt?: unknown | null;
    spinsToday: number;
  };
  dailyChallenge: {
    completedDate: string | null;
    completedAt?: unknown | null;
    rewardClaimedDate: string | null;
    rewardClaimedAt?: unknown | null;
    rewardDoubledDate: string | null;
    rewardDoubledAt?: unknown | null;
    bestCorrectToday: number;
  };
}
