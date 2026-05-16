import { AvatarModel } from '../models/avatar.model';

export const AVATARS: AvatarModel[] = [
  { id: 'letter', label: 'Iniziale', minLevel: 1 },
  {
    id: 'crown',
    label: 'Corona',
    icon: '👑',
    minLevel: 3,
  },
  {
    id: 'brain',
    label: 'Genio',
    icon: '🧠',
    minLevel: 5,
  },
  {
    id: 'trophy',
    label: 'Campione',
    icon: '🏆',
    minLevel: 10,
  },
];
