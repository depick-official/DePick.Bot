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
    // ── CREDIT-side legacy fields (DB-only ledger; retire at M9 with NAIVE) ──
    totalPoolAmountCredit: number;
    homeTeamPoolCredit: number;
    awayTeamPoolCredit: number;
    // ── M4.1 chain-native fields ──
    homeOdds: number;                 // [0,1], sum-to-1 with awayOdds
    awayOdds: number;
    marketId: number | null;          // null for NAIVE
    marketContractAddress: string;
    marketCollateralToken: number;    // PICK; chain-native depth (M4.1 / M4.5)
    marketVolumeToken: { home: number; away: number; total: number };
    tournament?: string;
    status: PredictionGameStatus | string;
    result?: PredictionGameResult | string;
    create_time: string;
    update_time: string;
}

// ── M4.2 quote endpoint ─────────────────────────────────────────────────────

export interface QuoteRequest {
    selectedTeam: 'HOME' | 'AWAY';
    amount: number; // PICK, > 0
}

export interface QuoteResponse {
    fee: number;               // deposit fee (LMSR-only today; 0 for NAIVE)
    netStake: number;          // amount − fee
    sharesOut: number;         // chain-true post-slippage shares
    avgEntryPrice: number;     // [0,1]
    potentialPayout: number;   // GROSS of claim-time withdraw fee — render as "To Win"
    mmType: 'LMSR' | 'NAIVE';
} 