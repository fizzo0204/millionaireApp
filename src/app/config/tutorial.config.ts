import { TutorialStep } from 'src/app/models/tutorial.model';

export const TUTORIAL_CONFIG = {
  mascotSrc: 'assets/mascotte/mascotte.webp',
  rewardAvatarId: 'tutorial_sage_turtle',
  rewardCoins: 30,
  homeOpenDelayMs: 650,
  authWaitTimeoutMs: 3500,
  storagePrefix: 'tutorial_onboarding',
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    kind: 'intro',
    eyebrow: 'La guida inizia',
    title: 'Sono la tua tartaruga saggia',
    body: 'Ti accompagno in un giro veloce tra categorie, livelli e aiuti. Arriva fino in fondo e ti regalo 30 TurtleCoins più il mio avatar speciale.',
  },
  {
    id: 'categories',
    kind: 'coach',
    eyebrow: 'Prima lezione',
    title: 'Parti da una categoria',
    body: 'Scegli la strada che ti ispira. Ogni categoria è una piccola scalata da conquistare, domanda dopo domanda.',
    route: '/home',
    targetId: 'home-category-card',
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
    kind: 'coach',
    eyebrow: 'Seconda lezione',
    title: 'Le difficoltà si aprono con i risultati',
    body: 'Completa Easy per aprire Medium, poi continua verso Hard ed Extreme. La strada cresce con le nuove domande.',
    route: '/difficulty/sport',
    targetId: 'difficulty-grid',
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
    id: 'profile-xp',
    kind: 'coach',
    eyebrow: 'Crescita',
    title: 'Qui controlli XP e livello',
    body: 'Ogni risposta corretta ti avvicina al livello successivo. La barra ti dice quanto manca al prossimo traguardo.',
    route: '/profile',
    targetId: 'profile-level-card',
  },
  {
    id: 'coins',
    kind: 'coach',
    eyebrow: 'Risorse',
    title: 'Le TurtleCoins sono la tua scorta',
    body: 'Usale con saggezza per comprare aiuti nei momenti difficili. A volte una moneta salva una partita.',
    route: '/home',
    targetId: 'home-coins-stat',
  },
  {
    id: 'demo-question',
    kind: 'demo-question',
    eyebrow: 'Prova con me',
    title: 'Rispondi alla domanda demo',
    body: 'Qui non perdi vite. Voglio solo mostrarti il ritmo della domanda prima della vera sfida.',
    demoQuestion: {
      question: 'Quanto fa 2 + 2?',
      answers: ['3', '4', '5', '22'],
      correctIndex: 1,
    },
  },
  {
    id: 'helps',
    kind: 'helps',
    eyebrow: 'Consiglio saggio',
    title: 'Gli aiuti sono risorse preziose',
    body: 'Usali nei momenti difficili: consumano TurtleCoins, ma possono salvare una partita importante.',
    highlights: [
      {
        title: '50/50',
        description: 'Toglie due risposte sbagliate.',
      },
      {
        title: 'Pubblico',
        description: 'Ti suggerisce la risposta più probabile.',
      },
      {
        title: 'Cambio',
        description: 'Passa ad una nuova domanda.',
      },
    ],
  },
  {
    id: 'reward',
    kind: 'reward',
    eyebrow: 'Ultimo passo',
    title: 'Completa la guida e incassa il bonus',
    body: "Ti regalo 30 TurtleCoins e l'avatar Tartaruga Saggia. Gli XP, invece, li guadagni giocando e completando i livelli veri.",
  },
];
