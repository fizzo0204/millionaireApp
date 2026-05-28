export type DailyMissionMetric =
  | 'adsWatched'
  | 'dailyRewardChecks'
  | 'wheelSpins'
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
  progress: number;
  claimed: boolean;
  completed: boolean;
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
  amount?: number;
}

export interface DailyEventsData {
  dateKey: string;
  metrics: Partial<Record<DailyMissionMetric, number>>;
  missionClaims: Record<string, boolean>;
  wheel: {
    freeSpinDate: string | null;
    spinsToday: number;
  };
  dailyChallenge: {
    completedDate: string | null;
    rewardClaimedDate: string | null;
    rewardDoubledDate: string | null;
    bestCorrectToday: number;
  };
}
