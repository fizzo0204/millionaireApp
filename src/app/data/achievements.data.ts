import { AchievementRewardModel } from '../models/achievement.model';

export type AchievementMetric =
  | 'quizPlayed'
  | 'correctAnswers'
  | 'level'
  | 'xp'
  | 'streakDays'
  | 'accuracy'
  | 'avatarsUnlocked'
  | 'tutorialCompleted';

export interface AchievementDefinition {
  id: string;
  icon: string;
  title: string;
  description: string;
  metric: AchievementMetric;
  target: number;
  minAnswers?: number;
  reward: AchievementRewardModel;
}

const PENDING_REWARD: AchievementRewardModel = {
  type: 'pending',
  label: 'Premio da definire',
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'quiz_1',
    icon: '🎮',
    title: 'Primo tuffo',
    description: 'Gioca il tuo primo quiz',
    metric: 'quizPlayed',
    target: 1,
    reward: PENDING_REWARD,
  },
  {
    id: 'quiz_10',
    icon: '🚀',
    title: 'Partenza',
    description: 'Gioca 10 quiz',
    metric: 'quizPlayed',
    target: 10,
    reward: PENDING_REWARD,
  },
  {
    id: 'quiz_50',
    icon: '🔥',
    title: 'Allenato',
    description: 'Gioca 50 quiz',
    metric: 'quizPlayed',
    target: 50,
    reward: PENDING_REWARD,
  },
  {
    id: 'quiz_100',
    icon: '👑',
    title: 'Esperto',
    description: 'Gioca 100 quiz',
    metric: 'quizPlayed',
    target: 100,
    reward: PENDING_REWARD,
  },
  {
    id: 'quiz_250',
    icon: '💎',
    title: 'Veterano',
    description: 'Gioca 250 quiz',
    metric: 'quizPlayed',
    target: 250,
    reward: PENDING_REWARD,
  },
  {
    id: 'correct_25',
    icon: '🎯',
    title: 'Mira calda',
    description: 'Dai 25 risposte corrette',
    metric: 'correctAnswers',
    target: 25,
    reward: PENDING_REWARD,
  },
  {
    id: 'correct_100',
    icon: '⚡',
    title: 'Precisione',
    description: 'Dai 100 risposte corrette',
    metric: 'correctAnswers',
    target: 100,
    reward: PENDING_REWARD,
  },
  {
    id: 'correct_500',
    icon: '🧠',
    title: 'Mente rapida',
    description: 'Dai 500 risposte corrette',
    metric: 'correctAnswers',
    target: 500,
    reward: PENDING_REWARD,
  },
  {
    id: 'correct_1000',
    icon: '🌟',
    title: 'Sapiente',
    description: 'Dai 1000 risposte corrette',
    metric: 'correctAnswers',
    target: 1000,
    reward: PENDING_REWARD,
  },
  {
    id: 'level_5',
    icon: '🛡️',
    title: 'Nuovo rango',
    description: 'Raggiungi il livello 5',
    metric: 'level',
    target: 5,
    reward: PENDING_REWARD,
  },
  {
    id: 'level_10',
    icon: '🏆',
    title: 'Quiz Master',
    description: 'Raggiungi il livello 10',
    metric: 'level',
    target: 10,
    reward: PENDING_REWARD,
  },
  {
    id: 'level_25',
    icon: '🏰',
    title: 'Campione',
    description: 'Raggiungi il livello 25',
    metric: 'level',
    target: 25,
    reward: PENDING_REWARD,
  },
  {
    id: 'level_50',
    icon: '💫',
    title: 'Leggenda',
    description: 'Raggiungi il livello 50',
    metric: 'level',
    target: 50,
    reward: PENDING_REWARD,
  },
  {
    id: 'level_100',
    icon: '🌌',
    title: 'Mito TurtleMind',
    description: 'Raggiungi il livello 100',
    metric: 'level',
    target: 100,
    reward: PENDING_REWARD,
  },
  {
    id: 'xp_1000',
    icon: '✨',
    title: 'Scintilla',
    description: 'Accumula 1000 XP',
    metric: 'xp',
    target: 1000,
    reward: PENDING_REWARD,
  },
  {
    id: 'xp_5000',
    icon: '💥',
    title: 'Energia pura',
    description: 'Accumula 5000 XP',
    metric: 'xp',
    target: 5000,
    reward: PENDING_REWARD,
  },
  {
    id: 'xp_15000',
    icon: '🔮',
    title: 'Aura brillante',
    description: 'Accumula 15000 XP',
    metric: 'xp',
    target: 15000,
    reward: PENDING_REWARD,
  },
  {
    id: 'streak_3',
    icon: '📆',
    title: 'Costante',
    description: 'Gioca per 3 giorni di fila',
    metric: 'streakDays',
    target: 3,
    reward: PENDING_REWARD,
  },
  {
    id: 'streak_7',
    icon: '🌈',
    title: 'Settimana d’oro',
    description: 'Gioca per 7 giorni di fila',
    metric: 'streakDays',
    target: 7,
    reward: PENDING_REWARD,
  },
  {
    id: 'streak_30',
    icon: '☀️',
    title: 'Inarrestabile',
    description: 'Gioca per 30 giorni di fila',
    metric: 'streakDays',
    target: 30,
    reward: PENDING_REWARD,
  },
  {
    id: 'accuracy_70',
    icon: '🎯',
    title: 'Mano ferma',
    description: 'Raggiungi il 70% con almeno 50 risposte',
    metric: 'accuracy',
    target: 70,
    minAnswers: 50,
    reward: PENDING_REWARD,
  },
  {
    id: 'accuracy_80',
    icon: '🏹',
    title: 'Cecchino',
    description: 'Raggiungi l’80% con almeno 100 risposte',
    metric: 'accuracy',
    target: 80,
    minAnswers: 100,
    reward: PENDING_REWARD,
  },
  {
    id: 'accuracy_90',
    icon: '🧩',
    title: 'Genio lucido',
    description: 'Raggiungi il 90% con almeno 200 risposte',
    metric: 'accuracy',
    target: 90,
    minAnswers: 200,
    reward: PENDING_REWARD,
  },
  {
    id: 'avatar_1',
    icon: '🎭',
    title: 'Nuovo look',
    description: 'Sblocca il tuo primo avatar speciale',
    metric: 'avatarsUnlocked',
    target: 1,
    reward: PENDING_REWARD,
  },
  {
    id: 'avatar_5',
    icon: '🎨',
    title: 'Collezionista',
    description: 'Sblocca 5 avatar speciali',
    metric: 'avatarsUnlocked',
    target: 5,
    reward: PENDING_REWARD,
  },
  {
    id: 'avatar_10',
    icon: '🖼️',
    title: 'Galleria viva',
    description: 'Sblocca 10 avatar speciali',
    metric: 'avatarsUnlocked',
    target: 10,
    reward: PENDING_REWARD,
  },
  {
    id: 'tutorial_completed',
    icon: '🐢',
    title: 'Allievo saggio',
    description: 'Completa il tutorial iniziale',
    metric: 'tutorialCompleted',
    target: 1,
    reward: PENDING_REWARD,
  },
];
