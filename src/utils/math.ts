/**
 * Format large numbers to k format
 * @param num Number to format
 * @returns Formatted string
 */
export const formatNumber = (num: number): string => {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + ' k';
    }
    return (num).toFixed(0);
};

/**
 * Calculate time remaining
 * @param targetDate Target date string
 * @returns Formatted time string (D:HH:MM:SS)
 */
export const calculateTimeLeft = (targetDate: string) => {
    const difference = new Date(targetDate).getTime() - new Date().getTime();

    if (difference <= 0) {
        return "0:00:00:00";
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((difference / 1000 / 60) % 60);
    const seconds = Math.floor((difference / 1000) % 60);

    return `${days}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Format number to two decimal places using Math.round
 * @param value Value to format (can be string or number)
 * @returns Formatted string with exactly two decimal places
 * @example
 * formatToTwoDecimals(123.456) // returns "123.46"
 * formatToTwoDecimals("123.454") // returns "123.45"
 * formatToTwoDecimals(undefined) // returns "0.00"
 */
export const formatToTwoDecimals = (value: string | number | undefined): string => {
    if (!value) return '0.00';

    // Convert string to number if needed
    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    // Round to 2 decimal places using Math.round
    const roundedValue = Math.round(numValue * 100) / 100;

    // Format to always show 2 decimal places
    return roundedValue.toFixed(2);
};

/**
 * Calculate boosted winning value based on boostInfo
 * @param winningPrize Base winning prize
 * @param boostInfo Boost information object
 * @returns Boosted winning value
 */
export const calculateBoostedWinningValue = (winningPrize: number, boostInfo?: { totalBoost?: number; count?: number }): number => {
    if (!boostInfo?.totalBoost || boostInfo?.count === undefined) {
        return winningPrize;
    }
    
    const multiplier = (boostInfo.totalBoost - boostInfo.count) + 1;
    return winningPrize * multiplier;
};

/**
 * Convert kei (smallest unit) to KAIA with proper type handling
 * @param balance Balance value in kei (can be string, number, or bigint)
 * @returns Formatted balance string in KAIA with up to 2 decimal places (truncated)
 * @example
 * convertKeiToKAIA('1000000000000000000') // returns "1.00"
 * convertKeiToKAIA('500000000000000000') // returns "0.50"
 * convertKeiToKAIA('123456789000000000') // returns "0.12" (truncated, not rounded)
 */
export const convertKeiToKAIA = (balance: unknown): string => {
    const KAIA_DECIMALS = 18;
    const DEFAULT_BALANCE = '0.00';
    
    try {
        let balanceInKei: bigint;
        
        // Handle different balance formats returned by wallet provider
        if (typeof balance === 'string') {
            // Remove '0x' prefix if present (hex format)
            const cleanBalance = balance.startsWith('0x') ? balance.slice(2) : balance;
            balanceInKei = BigInt(`0x${cleanBalance}`);
        } else if (typeof balance === 'number') {
            // Handle numeric values
            if (!Number.isFinite(balance)) {
                throw new Error('Invalid numeric balance value');
            }
            balanceInKei = BigInt(Math.floor(balance));
        } else if (typeof balance === 'bigint') {
            // Handle BigInt values directly
            balanceInKei = balance;
        } else {
            throw new Error(`Unsupported balance type: ${typeof balance}`);
        }
        
        // Validate balance is non-negative
        if (balanceInKei < 0n) {
            throw new Error('Balance cannot be negative');
        }
        
        // Convert kei to KAIA with precision handling
        const kaiaBalance = Number(balanceInKei) / Math.pow(10, KAIA_DECIMALS);
        
        // Format to 2 decimal places using truncation (not rounding)
        if (kaiaBalance === 0) {
            return DEFAULT_BALANCE;
        }
        
        // Truncate to 2 decimal places (multiply by 100, floor, then divide by 100)
        const truncatedBalance = Math.floor(kaiaBalance * 100) / 100;
        
        // Format to always show 2 decimal places
        const formattedBalance = truncatedBalance.toFixed(2);
        
        // Remove trailing zeros after decimal point, but keep at least 2 decimal places
        return formattedBalance.replace(/\.?0+$/, '') || DEFAULT_BALANCE;
        
    } catch (error) {
        console.error('Error converting balance from kei to KAIA:', {
            originalBalance: balance,
            error: error instanceof Error ? error.message : 'Unknown conversion error'
        });
        return DEFAULT_BALANCE;
    }
}; 