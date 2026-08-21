import { CurrencyType } from "./PredictionRecord";
import { Team } from "./Team";

export type LoginProvider = 'METAMASK' | 'GOOGLE' |  'OKX' | 'BITGET' | 'TELEGRAM' | 'MESSENGER' | 'DISCORD' | 'LINE' |'KAIAWALLET' | 'undefined';

export enum LoginProviderEnum {
    LINE = 'LINE',
    KAIAWALLET = 'KAIAWALLET',
}
export interface CreateUserRequest {
    id: string;
    loginProvider: LoginProvider;
    access_token: string;
    username: string;
    favoriteTeamId: string;
    referralCode?: string;
    externalWalletAddress?: string;
}

export interface LoginUserRequest {
    id: string;
    loginProvider: LoginProvider;
    access_token: string;
}

export interface CreateUserResponse {
    token: string;
    username: string;
    expiredAt: number;
}

export interface User {
    id: string;
    username: string;
    walletAddress: string;
    referralCode: string;
    referralBy: string | null;
    favoriteTeam: Team;
    avatar?: string;
    follower?: number;
    following?: number;
    playedMatch?: number;
    winRate?: number;
    externalWalletAddress?: string;
    bio: string | null;
    credit: string;
    token: string;
    telegramId?: string;
    lineId?: string;
    provider?: string;
    loginType?: string;
    createTime: string;
    updateTime: string;
} 

export interface UpdateUserBalanceRequest {
    amount: string;
    type: CurrencyType;
} 

export interface UpdateUserProfileRequest {
    username: string;
    bio: string;
}

export interface UploadAvatarRequest {
    avatar: string;
}

export interface ConnectMetaMaskRequest {
    externalWalletAddress: string;
}

export interface TelegramAuthRequest {
    telegramId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    photoUrl?: string;
    authDate: number;
    hash: string;
}

export interface LineAuthRequest {
    lineID: string;
    displayName?: string;
    pictureUrl?: string;
    statusMessage?: string;
    email?: string;
    authDate: number;
    hash: string;
}
