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
    // ── M4.1 chain-native fields (the BE serves these; the FE renders odds/depth from them) ──
    homeOdds: number;                 // [0,1]; sums to 1 with awayOdds (+ tieOdds for 3-way)
    awayOdds: number;
    tieOdds?: number;                 // 3-way (home/draw/away) markets only; 0/undefined for 2-way
    marketId: number | null;          // null for NAIVE
    marketContractAddress: string;
    marketCollateralToken: number;    // PICK; chain-native pool DEPTH (use this for "Token Pool")
    marketVolumeToken: { home: number; away: number; tie?: number; total: number };
    tournament?: string;
    status: PredictionGameStatus | string;
    result?: PredictionGameResult | string;
    create_time: string;
    update_time: string;
}

// ── M4.2 quote endpoint ─────────────────────────────────────────────────────

export interface QuoteRequest {
    selectedTeam: 'HOME' | 'AWAY' | 'TIE';   // TIE = draw (3-way markets); BE quotes option 2
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
