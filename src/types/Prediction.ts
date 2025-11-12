import { Team } from './Team';

export enum PredictionGameStatus {
    UPCOMING = 'UPCOMING',
    ON_GOING = 'ON_GOING',
    PLAYED = 'PLAYED',
}

export enum PredictionGameResult {
    HOME = 'HOME',
    AWAY = 'AWAY',
    TIE = 'TIE',
    PENDING = 'PENDING'
}

export interface Prediction {
    id: string;
    datetime: string;
    homeTeam: Team;
    awayTeam: Team;
    totalPoolAmountToken: number;
    totalPoolAmountCredit: number;
    homeTeamPoolCredit: number;
    awayTeamPoolCredit: number;
    homeTeamPoolToken: number;
    awayTeamPoolToken: number;
    tournament?: string;
    status: PredictionGameStatus | string;
    result?: PredictionGameResult | string;
    create_time: string;
    update_time: string;
} 