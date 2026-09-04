import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { depositApi, DepositConfig, DepositTokenSpec } from '../services/api';
import { fromRaw, toRaw } from '../utils/decimals';
import '../styles/pages.scss';

/**
 * buyPick QR flow — the "scan-to-pay" companion to the sign-app deposit
 * (`DepositPage`). The user enters how much PICK they want; we show the USDC
 * cost and render an EIP-681 QR that any wallet (MetaMask etc.) pre-fills as a
 * token transfer to the treasury. They send from their REGISTERED wallet, and
 * the backend push-deposit scanner credits PICK automatically — no signature,
 * no wallet-connect, no sign-app.
 *
 * PICK→USDC direction: the backend quote only goes USDC→PICK, so we fetch the
 * live rate once (a single forward quote at a 1-token reference) and invert it
 * by proportion. That's decimal-safe — it's a ratio of two raw amounts the BE
 * already computed, never touching `ratioWAD` or decimal exponents. The final
 * PICK is recomputed on-chain when the deposit lands, so this figure is an
 * estimate either way.
 */
export default function BuyPickQrPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<DepositConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<string>('');
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [pickStr, setPickStr] = useState<string>('');
  // Live rate as a raw (USDC, PICK) reference pair — inverted locally per keystroke.
  const [rate, setRate] = useState<{ refUsdcRaw: bigint; refPickRaw: bigint } | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load config on mount. Default to Polygon (the launch rail) when present.
  useEffect(() => {
    depositApi
      .getConfig()
      .then((c) => {
        setConfig(c);
        const preferred = c.chains.find((ch) => ch.key === 'polygon') ?? c.chains[0];
        if (preferred) {
          setSelectedChain(preferred.key);
          setSelectedToken(preferred.tokens[0]?.address ?? '');
        }
      })
      .catch((err) => {
        console.error('[buypick-qr] config fetch failed', err);
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
  const treasury = chainSpec?.treasury ?? null;

  // Fetch the live rate once per (chain, token): a single forward quote at a
  // 1-token reference gives us (refUsdcRaw → refPickRaw); PICK→USDC is then pure
  // local proportion. BE caches the ratio 120 s, so this is cheap.
  useEffect(() => {
    setRate(null);
    setRateError(null);
    if (!chainSpec || !tokenSpec) return;
    const refUsdcRaw = 10n ** BigInt(tokenSpec.decimals); // 1.0 token
    let cancelled = false;
    depositApi
      .getQuote(chainSpec.key, tokenSpec.address, refUsdcRaw.toString())
      .then((q) => {
        if (!cancelled) setRate({ refUsdcRaw, refPickRaw: BigInt(q.pickRawAmount) });
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error('[buypick-qr] rate fetch failed', err);
        setRateError(err?.response?.data?.message ?? err?.message ?? 'Rate unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [chainSpec, tokenSpec]);

  const pickRaw: bigint | null = useMemo(
    () => (config ? toRaw(pickStr, config.pick.decimals) : null),
    [pickStr, config],
  );

  // usdcRaw = ceil(pickRaw · refUsdcRaw / refPickRaw) — round UP so the sent
  // amount always covers the requested PICK.
  const usdcRaw: bigint | null = useMemo(() => {
    if (!rate || pickRaw === null || pickRaw <= 0n || rate.refPickRaw <= 0n) return null;
    return (pickRaw * rate.refUsdcRaw + rate.refPickRaw - 1n) / rate.refPickRaw;
  }, [rate, pickRaw]);

  const usdcDisplay = useMemo(
    () => (usdcRaw !== null && tokenSpec ? fromRaw(usdcRaw, tokenSpec.decimals) : null),
    [usdcRaw, tokenSpec],
  );

  // EIP-681 payment URI — wallets render this as a pre-filled ERC-20 transfer.
  const eip681 = useMemo(() => {
    if (!chainSpec || !tokenSpec || !treasury || usdcRaw === null) return null;
    return `ethereum:${tokenSpec.address}@${chainSpec.chainId}/transfer?address=${treasury}&uint256=${usdcRaw.toString()}`;
  }, [chainSpec, tokenSpec, treasury, usdcRaw]);

  const copyTreasury = () => {
    if (!treasury) return;
    navigator.clipboard?.writeText(treasury)?.then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {/* clipboard blocked — the address is visible to copy manually */},
    );
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
        <div className="loading">Loading buy gateway…</div>
      </div>
    );
  }

  const treasuryShort = treasury ? `${treasury.slice(0, 6)}…${treasury.slice(-4)}` : '';

  return (
    <div className="container">
      <div className="header">
        <h1>💵 Buy PICK</h1>
        <p>Scan to pay — send a stablecoin and PICK lands automatically</p>
      </div>

      {config.chains.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, color: '#cac5d6', fontSize: 13 }}>Chain</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {config.chains.map((c) => {
              const selected = c.key === selectedChain;
              return (
                <button
                  key={c.key}
                  onClick={() => {
                    setSelectedChain(c.key);
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

      {chainSpec && chainSpec.tokens.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, color: '#cac5d6', fontSize: 13 }}>Pay with</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {chainSpec.tokens.map((t) => {
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
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, color: '#cac5d6', fontSize: 13 }}>
          How much PICK do you want?
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            inputMode="decimal"
            value={pickStr}
            onChange={(e) => setPickStr(e.target.value)}
            placeholder="0"
            style={{
              width: '100%',
              padding: '12px 64px 12px 12px',
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
            PICK
          </span>
        </div>
        {pickStr !== '' && pickRaw === null && (
          <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 4 }}>
            Invalid amount — max {config.pick.decimals} decimal places.
          </div>
        )}
      </div>

      {/* Cost preview */}
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: '#1a1424',
          marginBottom: 16,
          border: '1px solid #2a2438',
        }}
      >
        <div style={{ color: '#cac5d6', fontSize: 13 }}>Cost</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#f5a623', marginTop: 4 }}>
          {rateError
            ? '—'
            : usdcDisplay !== null
              ? `≈ ${usdcDisplay} ${tokenSpec?.symbol ?? ''}`
              : rate
                ? `— ${tokenSpec?.symbol ?? ''}`
                : 'calculating rate…'}
        </div>
        {rateError ? (
          <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 4 }}>{rateError}</div>
        ) : (
          <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
            Final PICK is set at the live rate when your deposit confirms.
          </div>
        )}
      </div>

      {/* QR + instructions — only once we have a payable URI */}
      {!treasury && rate && (
        <div className="error" style={{ marginBottom: 16 }}>
          QR pay-in isn't available for this chain yet. Use the sign-in-wallet flow below.
        </div>
      )}

      {eip681 && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: '#1a1424',
            marginBottom: 16,
            border: '1px solid #2a2438',
            textAlign: 'center',
          }}
        >
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, display: 'inline-block' }}>
            <QRCodeSVG value={eip681} size={200} level="M" />
          </div>
          <div style={{ color: '#cac5d6', fontSize: 13, marginTop: 12 }}>
            Scan with your wallet — it pre-fills a transfer of{' '}
            <b>
              {usdcDisplay} {tokenSpec?.symbol}
            </b>
          </div>
          <button
            onClick={copyTreasury}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #555',
              background: 'transparent',
              color: '#cac5d6',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ Copied' : `Pay-to: ${treasuryShort} — copy`}
          </button>
        </div>
      )}

      {/* The one hard constraint: attribution is by sender address. */}
      <div
        style={{
          padding: 12,
          borderRadius: 8,
          background: '#2a1f10',
          border: '1px solid #6b4f1f',
          color: '#f5d69a',
          fontSize: 13,
          lineHeight: 1.45,
          marginBottom: 20,
        }}
      >
        ⚠️ <b>Send from the wallet you registered</b> (the one in <code>/settings → Register Wallet</code>).
        A deposit from any other wallet or an exchange can't be matched to you and won't credit
        automatically.
      </div>

      <button
        onClick={() => navigate('/deposit')}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: 8,
          border: '1px solid #555',
          background: 'transparent',
          color: '#cac5d6',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        Prefer to pay by signing in your wallet? →
      </button>
    </div>
  );
}
