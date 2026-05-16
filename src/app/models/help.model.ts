export type HelpId = 'fifty' | 'switch' | 'audience';

export interface HelpModel {
  id: HelpId;
  icon: string;
  title: string;
  cost: number;
}
