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

// M6.2.d — BE returns this in place of a PredictionRecord when the user has
// `useEoaForPrediction=true` AND a real EOA on file. Chain submission is
// deferred to the Mini App at `signingUrl`; the PredictionRecord row is written
// by /eoa/signing-callback (M6.3) once the relayer-broadcast tx confirms.
export interface PendingSessionResponse {
  kind: 'pending';
  signingUrl: string;
  sessionId: string;
  ttlMs: number;
}

// Discriminated union returned by POST /prediction-records. Callers must check
// `'kind' in result && result.kind === 'pending'` BEFORE treating the response
// as a PredictionRecord — otherwise the UI false-positives a success.
export type CreatePredictionResult = PredictionRecord | PendingSessionResponse;

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