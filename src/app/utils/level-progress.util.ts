import { USER_STATS_CONFIG } from 'src/app/config/user-stats.config';

export interface LevelProgress {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export function getXpRequiredForNextLevel(level: number): number {
  const safeLevel = Math.max(USER_STATS_CONFIG.defaultLevel, Math.floor(level));

  if (safeLevel >= USER_STATS_CONFIG.maxLevel) return 0;

  return Math.round(
    USER_STATS_CONFIG.levelXpBase +
      safeLevel * USER_STATS_CONFIG.levelXpLinearStep +
      safeLevel * safeLevel * USER_STATS_CONFIG.levelXpQuadraticStep,
  );
}

export function getTotalXpRequiredForLevel(level: number): number {
  const targetLevel = Math.min(
    USER_STATS_CONFIG.maxLevel,
    Math.max(USER_STATS_CONFIG.defaultLevel, Math.floor(level)),
  );

  let totalXp = 0;

  for (
    let currentLevel = USER_STATS_CONFIG.defaultLevel;
    currentLevel < targetLevel;
    currentLevel++
  ) {
    totalXp += getXpRequiredForNextLevel(currentLevel);
  }

  return totalXp;
}

export function getLevelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let remainingXp = safeXp;
  let level = USER_STATS_CONFIG.defaultLevel;

  while (level < USER_STATS_CONFIG.maxLevel) {
    const requiredXp = getXpRequiredForNextLevel(level);

    if (remainingXp < requiredXp) break;

    remainingXp -= requiredXp;
    level++;
  }

  return level;
}

export function getLevelProgress(xp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = getLevelFromXp(safeXp);
  const isMaxLevel = level >= USER_STATS_CONFIG.maxLevel;
  const currentLevelStartXp = getTotalXpRequiredForLevel(level);
  const nextLevelXp = isMaxLevel ? 0 : getXpRequiredForNextLevel(level);
  const currentLevelXp = isMaxLevel
    ? 0
    : Math.max(0, safeXp - currentLevelStartXp);
  const progressPercent = isMaxLevel
    ? 100
    : Math.round((currentLevelXp / nextLevelXp) * 100);

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressPercent,
    isMaxLevel,
  };
}
