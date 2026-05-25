import { TutorialStep } from 'src/app/models/tutorial.model';

export const TUTORIAL_CONFIG = {
  mascotSrc: 'assets/mascotte/mascotte.webp',
  rewardCoins: 30,
  homeOpenDelayMs: 650,
  authWaitTimeoutMs: 3500,
  storagePrefix: 'tutorial_onboarding',
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    kind: 'intro',
    eyebrow: 'Nuova avventura',
    title: 'Benvenuto in TurtleMind',
    body:
      'Ti guido in un giro veloce: categorie, livelli, aiuti e ricompensa finale. Se completi tutto, ricevi 30 monete.',
  },
  {
    id: 'categories',
    kind: 'focus',
    eyebrow: 'Scegli la strada',
    title: 'Parti da una categoria',
    body:
      'Ogni categoria e una piccola scalata. Scegli quella che ti ispira e prova a completare i livelli uno dopo l altro.',
    highlights: [
      {
        title: 'Categorie',
        description: 'Sport, cinema, storia, scienze e altro.',
      },
      {
        title: 'Progressi',
        description: 'Ogni vittoria sblocca nuove sfide.',
      },
    ],
  },
  {
    id: 'difficulty',
    kind: 'focus',
    eyebrow: 'La scalata',
    title: 'Le difficolta si aprono con i tuoi risultati',
    body:
      'Completa Easy per aprire Medium, poi continua verso Hard ed Extreme. Se aggiungiamo nuove domande, la scalata resta viva.',
    highlights: [
      {
        title: 'Easy',
        description: 'Il punto giusto per iniziare.',
      },
      {
        title: 'Medium+',
        description: 'Si sblocca quando completi la difficolta precedente.',
      },
    ],
  },
  {
    id: 'demo-question',
    kind: 'demo-question',
    eyebrow: 'Prova guidata',
    title: 'Rispondi alla domanda demo',
    body:
      'Qui non perdi vite: serve solo a farti vedere il ritmo della domanda.',
    demoQuestion: {
      question: 'Quanto fa 2 + 2?',
      answers: ['3', '4', '5', '22'],
      correctIndex: 1,
    },
  },
  {
    id: 'helps',
    kind: 'helps',
    eyebrow: 'Quando serve una mano',
    title: 'Gli aiuti sono risorse preziose',
    body:
      'Usali nei momenti difficili: consumano monete, ma possono salvare una partita importante.',
    highlights: [
      {
        title: '50/50',
        description: 'Toglie due risposte sbagliate.',
      },
      {
        title: 'Pubblico',
        description: 'Ti suggerisce la risposta piu probabile.',
      },
      {
        title: 'Cambio',
        description: 'Passa a una nuova domanda.',
      },
    ],
  },
  {
    id: 'reward',
    kind: 'reward',
    eyebrow: 'Pronto',
    title: 'Completa il tutorial e incassa il bonus',
    body:
      'Le monete ti serviranno per gli aiuti. Gli XP invece li guadagni giocando e completando i livelli veri.',
  },
];
