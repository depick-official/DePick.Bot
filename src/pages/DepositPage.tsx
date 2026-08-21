import { useEffect, useMemo, useState } from 'react';
import {
  depositApi,
  DepositConfig,
  DepositTokenSpec,
  DepositQuote,
} from '../services/api';
import { fromRaw, toRaw } from '../utils/decimals';
import { detectBootstrapProvider } from '../services/auth-bootstrap';
import '../styles/pages.scss';

/**
 * M7.5 — Deposit Mini App.
 *
 * Flow:
 *   1. Load `/deposits/config` on mount (chain list + token list + PICK metadata).
 *   2. User picks a token + types an amount.
 *   3. Debounced `/deposits/quote` shows the live PICK return (BE caches
 *      the underlying ratioWAD for 120 s, so typing is cheap).
 *   4. "Continue to Sign" → `/deposits/session` → redirect to the sign-app
 *      session URL. From there the sign-app's `kind === 'deposit'` branch
 *      handles the permit signature and POSTs the callback.
 */
const QUOTE_DEBOUNCE_MS = 300;

export default function DepositPage() {
  const [config, setConfig] = useState<DepositConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<string>('');
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [quote, setQuote] = useState<DepositQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitDone, setSubmitDone] = useState(false);

  // Load config on mount.
  useEffect(() => {
    depositApi
      .getConfig()
      .then((c) => {
        setConfig(c);
        if (c.chains.length > 0) {
          setSelectedChain(c.chains[0].key);
          if (c.chains[0].tokens.length > 0) {
            setSelectedToken(c.chains[0].tokens[0].address);
          }
        }
      })
      .catch((err) => {
        console.error('[deposit] config fetch failed', err);
        setConfigError(
          err?.response?.data?.message ?? err?.message ?? 'Could not load deposit gateway config.',
        );
      });
  }, []);

  const chainSpec = useMemo(
    () => config?.chains.find((c) => c.key === selectedChain) ?? null,
    [config, selectedChain],
  );
  const tokenSpec: DepositTokenSpec | null = useMemo(
    () => chainSpec?.tokens.find((t) => t.address === selectedToken) ?? null,
    [chainSpec, selectedToken],
  );

  const rawAmount: bigint | null = useMemo(() => {
    if (!tokenSpec) return null;
    return toRaw(amountStr, tokenSpec.decimals);
  }, [amountStr, tokenSpec]);

  // Debounced quote fetch.
  useEffect(() => {
    setQuoteError(null);
    if (!chainSpec || !tokenSpec || rawAmount === null || rawAmount <= 0n) {
      setQuote(null);
      return;
    }
    const handle = setTimeout(async () => {
      setIsQuoting(true);
      try {
        const q = await depositApi.getQuote(chainSpec.key, tokenSpec.address, rawAmount.toString());
        setQuote(q);
      } catch (err: any) {
        console.error('[deposit] quote fetch failed', err);
        setQuote(null);
        setQuoteError(
          err?.response?.data?.message ?? err?.message ?? 'Quote unavailable',
        );
      } finally {
        setIsQuoting(false);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [chainSpec, tokenSpec, rawAmount]);

  const handleSubmit = async () => {
    if (!chainSpec || !tokenSpec || rawAmount === null || rawAmount <= 0n) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const session = await depositApi.createSession(
        chainSpec.key,
        tokenSpec.address,
        rawAmount.toString(),
      );
      // Hand-off to the sign-app differs by channel (Step C / D2):
      //   - Discord: this Mini App is a real browser tab (no Telegram initData to
      //     preserve), and a bot DM can't be relied on (a user with DMs disabled
      //     hits Discord error 50007 and would dead-end). So navigate the tab
      //     straight to the sign-app. `session.signingUrl` already carries
      //     `provider=discord&exchange=<single-use token>`; the sign-app redeems
      //     it for a Bearer JWT. A top-level navigation is not CORS-governed, and
      //     the sign-app is served same-origin under the BE's /sign.
      //   - Telegram: the BE posted a `web_app`-button DM (the only hand-off that
      //     preserves initData across Mini Apps); we can't navigate from here, so
      //     show a "check your chat" confirmation.
      if (detectBootstrapProvider() === 'DISCORD') {
        window.location.href = session.signingUrl;
        return;
      }
      setSubmitDone(true);
    } catch (err: any) {
      console.error('[deposit] session create failed', err);
      const rawMsg = err?.response?.data?.message ?? err?.message ?? 'Could not start deposit session.';
      // The BE gates deposits on a registered external wallet (EOA) and returns a
      // developer-facing string naming the DB column. Map it to a friendly,
      // actionable message instead of leaking that internal wording to the user.
      const friendlyMsg = /registered EOA/i.test(rawMsg)
        ? 'Connect an external wallet first — buying PICK needs a wallet you control. In the bot, tap /settings → Register Wallet, then try again.'
        : rawMsg;
      setSubmitError(friendlyMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.close) tg.close();
  };

  if (configError) {
    return (
      <div className="container">
        <div className="error">{configError}</div>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="container">
        <div className="loading">Loading deposit gateway…</div>
      </div>
    );
  }
  if (submitDone) {
    return (
      <div className="container">
        <div className="header">
          <h1>📨 Sent to chat</h1>
          <p>
            Check your Telegram chat — we sent you a <b>Sign Deposit</b> button.
            Tap it to {tokenSpec?.gaslessMethod === 'FALLBACK_APPROVE'
              ? 'approve the token in your wallet'
              : 'sign the gasless permit'} and complete the deposit.
          </p>
        </div>
        <button
          onClick={handleClose}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 8,
            border: 'none',
            background: '#f5a623',
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            marginTop: 24,
          }}
        >
          Open Chat
        </button>
      </div>
    );
  }

  const submitDisabled = isSubmitting || rawAmount === null || rawAmount <= 0n || !quote;
  // Display always carries a fractional separator so integer-PICK results
  // read as "2000.0 PICK" not "2000 PICK" — matches how the user types the
  // input (always a decimal scale). `fromRaw` drops the fractional when
  // it's exactly zero, so we re-append the ".0" here.
  const pickRawDisplay = quote ? fromRaw(quote.pickRawAmount, config.pick.decimals) : '—';
  const pickFormatted =
    pickRawDisplay === '—' || pickRawDisplay.includes('.')
      ? pickRawDisplay
      : `${pickRawDisplay}.0`;

  return (
    <div className="container">
      <div className="header">
        <h1>💵 Buy PICK</h1>
        <p>Deposit a stablecoin to receive PICK</p>
      </div>

      {config.chains.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, color: '#cac5d6', fontSize: 13 }}>
            Chain
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {config.chains.map((c) => {
              const selected = c.key === selectedChain;
              return (
                <button
                  key={c.key}
                  onClick={() => {
                    setSelectedChain(c.key);
                    // Tokens are per-chain — reset selection to the new chain's first token.
                    setSelectedToken(c.tokens[0]?.address ?? '');
                  }}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: selected ? '2px solid #f5a623' : '1px solid #555',
                    background: selected ? '#3a2d4a' : 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: selected ? 700 : 400,
                  }}
                >
                  {c.chainName ?? c.key}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, color: '#cac5d6', fontSize: 13 }}>
          Token
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {chainSpec?.tokens.map((t) => {
            const selected = t.address === selectedToken;
            return (
              <button
                key={t.address}
                onClick={() => setSelectedToken(t.address)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: selected ? '2px solid #f5a623' : '1px solid #555',
                  background: selected ? '#3a2d4a' : 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: selected ? 700 : 400,
                }}
              >
                {t.symbol}
              </button>
            );
          })}
        </div>
      </div>

      {tokenSpec && (
        <div style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.45, color: '#cac5d6' }}>
          {tokenSpec.gaslessMethod === 'FALLBACK_APPROVE' ? (
            <>⛽ You'll send an <b>approval transaction</b> in your wallet and pay a small{' '}
            {chainSpec?.chainCurrency ?? 'network'} gas fee.</>
          ) : (
            <>✨ <b>Gasless</b> — you'll sign a free signature; no network gas needed.</>
          )}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, color: '#cac5d6', fontSize: 13 }}>
          Amount
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0.00"
            style={{
              width: '100%',
              padding: '12px 80px 12px 12px',
              borderRadius: 8,
              border: '1px solid #555',
              background: '#1a1424',
              color: '#fff',
              fontSize: 18,
              boxSizing: 'border-box',
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#cac5d6',
              fontWeight: 700,
            }}
          >
            {tokenSpec?.symbol ?? ''}
          </span>
        </div>
        {amountStr !== '' && rawAmount === null && (
          <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 4 }}>
            Invalid amount — max {tokenSpec?.decimals} decimal places.
          </div>
        )}
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: '#1a1424',
          marginBottom: 24,
          border: '1px solid #2a2438',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ color: '#cac5d6', fontSize: 13 }}>You receive</span>
          {isQuoting && (
            <span style={{ color: '#888', fontSize: 11 }}>quoting…</span>
          )}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#f5a623', marginTop: 4 }}>
          {pickFormatted} PICK
        </div>
        {quoteError && (
          <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 4 }}>{quoteError}</div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitDisabled}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: 8,
          border: 'none',
          background: submitDisabled ? '#555' : '#f5a623',
          color: '#fff',
          fontSize: 16,
          fontWeight: 700,
          cursor: submitDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        {isSubmitting ? 'Preparing…' : 'Continue to Sign'}
      </button>

      {submitError && (
        <div className="error" style={{ marginTop: 12 }}>
          {submitError}
        </div>
      )}
    </div>
  );
}
