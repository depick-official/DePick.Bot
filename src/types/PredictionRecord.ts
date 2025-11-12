import { Prediction } from "./Prediction";

// export interface Team {
//     name: string;
//     logo: string;
// } 
export enum CurrencyType {
  CREDIT = 'CREDIT',
  TOKEN = 'TOKEN'
};

export enum SelectedTeam {
  HOME = 'HOME',
  AWAY = 'AWAY'
};


export enum PredictionRecordResult {
  WIN = 'WIN',
  LOSE = 'LOSE',
  TIE = 'TIE',
  ON_GOING = 'ON_GOING'
}

export interface PredictionRecord {
  id: string;
  userId: string;
  predictionId: string;
  currencyType: CurrencyType;
  selectedTeam: SelectedTeam;
  predictionAmount: number;
  predictionPrice: number;
  winningPrize: number;
  multiplier: number;
  fees: number;
  claimableCredit: number;
  claimableToken: number;
  isFavoriteBonus: boolean;
  isTokenBonus: boolean;
  isClaimed: boolean;
  prediction: Prediction;
  result: PredictionRecordResult;
  createTime: string;
  updateTime: string;
  boostInfo?: {
    count: number;
    totalBoost: number;
    boostSpin: Array<{id: string, boost: number, used: boolean, createTime: string}>;
  };
}

export interface CreatePredictionRecordRequest {
  userId: string;
  predictionId: string;
  currencyType: CurrencyType;
  selectedTeam: SelectedTeam;
  predictionAmount: number;
  homeTeamPool: number;
  awayTeamPool: number;
}

export interface ClaimPredictionRecordRequest {
  predictionId: string;
}

export interface ClaimPredictionRecordResponse {
  tokens: number;
  credits: number;
  isFavoriteBonus: boolean;
  message?: string;
}

export interface GroupedPredictionRecord {
  predictionId: string;
  matchInfo: {
      datetime: string;
      homeTeam: {
          id: string;
          name: string;
          logo: string;
      };
      awayTeam: {
          id: string;
          name: string;
          logo: string;
      };
      status: string;
      result: string;
  };
  records: PredictionRecord[];
}