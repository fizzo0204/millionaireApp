export const LIVES_CONFIG = {
  maxLives: 5,
  recoveryTime: 15000,
  // recoveryTime: 30 * 60 * 1000,
  firestorePaths: {
    lives: 'stats.lives',
    lastLifeUpdate: 'stats.lastLifeUpdate',
  },
};
