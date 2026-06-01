import { CampaignType } from './campaign-type.enum';

export interface Campaign {
  id?: string;

  type?: CampaignType;

  title?: string;

  summary?: string;

  story?: string;

  heroImageUrl?: string;

  targetAmount?: number;

  startDate?: string;

  endDate?: string;
}
