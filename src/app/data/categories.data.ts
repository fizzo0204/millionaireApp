import { CategoryModel } from '../models/category.model';

export const CATEGORIES: CategoryModel[] = [
  {
    id: 'sport',
    title: 'Sport',
    icon: '⚽',
    description: 'Calcio, basket, tennis e grandi campioni',
    className: 'sport',
  },
  {
    id: 'cinema',
    title: 'Cinema',
    icon: '🎬',
    description: 'Film, attori, registi e grandi classici',
    className: 'cinema',
  },
  {
    id: 'storia',
    title: 'Storia',
    icon: '🏛️',
    description: 'Eventi, personaggi e grandi epoche',
    className: 'storia',
  },
  {
    id: 'geografia',
    title: 'Geografia',
    icon: '🌍',
    description: 'Capitali, paesi, bandiere e luoghi',
    className: 'geografia',
  },
  {
    id: 'scienza',
    title: 'Scienza',
    icon: '🔬',
    description: 'Scoperte, invenzioni e curiosità',
    className: 'scienza',
  },
  {
    id: 'musica',
    title: 'Musica',
    icon: '🎵',
    description: 'Artisti, canzoni e leggende',
    className: 'musica',
  },
  {
    id: 'tecnologia',
    title: 'Tecnologia',
    icon: '💡',
    description: 'Innovazioni, gadget e futuro',
    className: 'tecnologia',
  },
  {
    id: 'altro',
    title: 'Altro',
    icon: '⭐',
    description: 'Tante domande a sorpresa',
    className: 'altro',
  },
];
