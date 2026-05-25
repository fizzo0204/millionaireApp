export type TutorialMode = 'auto' | 'manual';

export type TutorialStepKind =
  | 'intro'
  | 'focus'
  | 'demo-question'
  | 'helps'
  | 'reward';

export interface TutorialDemoQuestion {
  question: string;
  answers: string[];
  correctIndex: number;
}

export interface TutorialHighlight {
  title: string;
  description: string;
}

export interface TutorialStep {
  id: string;
  kind: TutorialStepKind;
  eyebrow: string;
  title: string;
  body: string;
  demoQuestion?: TutorialDemoQuestion;
  highlights?: TutorialHighlight[];
}

export interface TutorialState {
  visible: boolean;
  stepIndex: number;
  mode: TutorialMode;
  loading: boolean;
  completed: boolean;
  rewardClaimed: boolean;
  rewardGranted: boolean;
}
