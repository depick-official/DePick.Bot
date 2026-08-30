import { useEffect, useState, CSSProperties } from 'react';
import {
  reportingApi,
  ModeratorCommunity,
  PredictionsSummary,
  PickSummary,
} from '../services/api';
import { fromRaw } from '../utils/decimals';
import '../styles/pages.scss';

/**
 * Franchise moderator dashboard — opened via the `/dashboard` bot command.
 * Community is server-derived (the moderator's own); this page just renders what
 * `/moderator/reports/*` returns. Emphasis: prediction volume + commission;
 * buyPick/sellPick compact. See docs/WIP/franchise-reporting/ARCHITECTURE.md.
 */
const RESULT_COLORS: Record<string, string> = {
  WIN: '#3ecf8e', LOSE: '#ff6b6b', TIE: '#ffd166', ON_GOING: '#8ab4ff',
};
const num = (n: number) => Math.round(n).toLocaleString('en-US');
const usdc = (raw: string) => fromRaw(raw, 6);

export default function ModeratorPortalPage() {
  const [community, setCommunity] = useState<ModeratorCommunity | null>(null);
  const [pred, setPred] = useState<PredictionsSummary | null>(null);
  const [pick, setPick] = useState<PickSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<{ result: string; rows: any[]; total: number; filterUserId?: string; filterUsername?: string } | null>(null);
  const [userView, setUserView] = useState<any | null>(null);
  const [userMenu, setUserMenu] = useState<{ userId: string; username: string } | null>(null);
  const [pickDrill, setPickDrill] = useState<{ type: 'buy' | 'sell'; rows: any[] } | null>(null);

  useEffect(() => {
    reportingApi
      .communities()
      .then(async (cs) => {
        if (!cs.length) { setError('You don’t manage a community yet.'); return; }
        const c = cs[0];
        setCommunity(c);
        const [p, k] = await Promise.all([
          reportingApi.predictionsSummary({ communityId: c.id }),
          reportingApi.pickSummary({ communityId: c.id }),
        ]);
        setPred(p); setPick(k);
      })
      .catch((e: any) =>
        setError(e?.response?.data?.message ?? e?.message ?? 'Could not load your dashboard.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const openDrill = async (result: string) => {
    if (!community) return;
    const r = await reportingApi.predictions({ communityId: community.id, result, limit: 100 });
    setDrill({ result, rows: r.items, total: r.total });
  };

  const openUserView = async (id: string) => {
    setUserMenu(null);
    try {
      setUserView(await reportingApi.userSummary(id));
    } catch {
      /* community-fenced or missing — ignore in v1 */
    }
  };

  const applyUserFilter = async (userId: string, username: string) => {
    if (!community || !drill) return;
    setUserMenu(null);
    const r = await reportingApi.predictions({ communityId: community.id, result: drill.result, userId, limit: 100 });
    setDrill({ ...drill, rows: r.items, total: r.total, filterUserId: userId, filterUsername: username });
  };

  const clearUserFilter = async () => {
    if (!community || !drill) return;
    const r = await reportingApi.predictions({ communityId: community.id, result: drill.result, limit: 100 });
    setDrill({ ...drill, rows: r.items, total: r.total, filterUserId: undefined, filterUsername: undefined });
  };

  const openPickDrill = async (type: 'buy' | 'sell') => {
    if (!community) return;
    const r = await reportingApi.pick({ communityId: community.id, type, limit: 100 });
    setPickDrill({ type, rows: r.items });
  };

  const downloadCsv = async () => {
    if (!community) return;
    const csv = await reportingApi.exportCsv({ communityId: community.id, dataset: 'all' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'my-community-report.csv';
    a.click();
  };

  if (loading) return <div className="container"><div className="loading">Loading your dashboard…</div></div>;
  if (error) return <div className="container"><div className="error">{error}</div></div>;
  if (!community || !pred || !pick) return <div className="container"><div className="error">No data.</div></div>;

  const feePct = (community.feeBps / 100).toFixed(1);
  const commission = pred.commission;
  const totUsdcRaw = (BigInt(pick.buyPick.usdcInRaw) + BigInt(pick.sellPick.usdcOutRaw)).toString();
  const totPickRaw = (BigInt(pick.buyPick.pickIssuedRaw) + BigInt(pick.sellPick.pickReclaimedRaw)).toString();

  const card = (label: string, value: string, sub?: string, hero?: boolean) => (
    <div style={{
      background: hero ? 'linear-gradient(180deg,rgba(245,166,35,.10),transparent)' : '#1c1630',
      border: `1px solid ${hero ? '#f5a623' : '#2f2547'}`, borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 12, color: '#a79fc0' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: hero ? '#f5a623' : '#ece8f5' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#a79fc0', marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="container">
      <div className="header">
        <h1>📊 {community.displayName ?? 'Your community'}</h1>
        <p>{community.scopeProvider === 'DISCORD' ? 'Discord' : 'Telegram'} · volume fee {feePct}% · read-only</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        {card('Prediction volume', `${num(pred.totals.volume)} PICK`, `${num(pred.totals.count)} predictions`, true)}
        {card('Your commission', commission ? `${num(commission.payableCommission)} PICK` : '—',
          commission ? `≈ ${num(commission.estimatedCommission)} incl. open` : '', true)}
        {card('buyPick (USDC in)', `$${usdc(pick.buyPick.usdcInRaw)}`, `${pick.buyPick.count} deposits`)}
        {card('sellPick (USDC out)', `$${usdc(pick.sellPick.usdcOutRaw)}`, `${pick.sellPick.count} withdrawals`)}
      </div>

      {/* Predictions — the commission source */}
      <section style={{ background: '#1c1630', border: '1px solid #2f2547', borderRadius: 12, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #2f2547', display: 'flex', gap: 8, alignItems: 'center' }}>
          <b>🎯 Predictions</b>
          <span style={{ fontSize: 11, color: '#f5a623', border: '1px solid #f5a623', borderRadius: 20, padding: '2px 8px' }}>commission source</span>
          <span style={{ fontSize: 12, color: '#a79fc0', marginLeft: 'auto' }}>tap a row</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Outcome', 'Count', 'Volume', 'Fee', 'Claimable', 'Unclaimed'].map((h, i) => (
            <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '9px 14px', fontSize: 11, color: '#a79fc0', textTransform: 'uppercase' }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            <tr style={{ background: '#241b3a', fontWeight: 800 }}>
              <td style={{ padding: '9px 14px', fontSize: 11, color: '#a79fc0' }}>TOTAL</td>
              <td style={tdR}>{num(pred.totals.count)}</td>
              <td style={tdR}>{num(pred.totals.volume)}</td>
              <td style={{ ...tdR, color: '#f5a623' }}>{commission ? num(pred.eligibility.payableVolume * community.feeBps / 10000) : '—'}</td>
              <td style={tdR}>{num(pred.totals.claimableToken)}</td>
              <td style={tdR}>{num(pred.totals.unclaimedToken)}</td>
            </tr>
            {pred.rows.map((r) => (
              <tr key={r.result} onClick={() => openDrill(r.result)} style={{ cursor: 'pointer' }}>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{ color: RESULT_COLORS[r.result], fontWeight: 700, fontSize: 12 }}>{r.result}</span>
                </td>
                <td style={tdR}>{num(r.count)}</td>
                <td style={tdR}>{num(r.volume)}</td>
                <td style={{ ...tdR, color: '#f5a623' }}>{num(r.volume * community.feeBps / 10000)}</td>
                <td style={tdR}>{num(r.claimableToken)}</td>
                <td style={tdR}>{num(r.unclaimedToken)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* PICK transactions table */}
      <section style={{ background: '#1c1630', border: '1px solid #2f2547', borderRadius: 12, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #2f2547' }}>
          <b>🪙 PICK transactions</b> <span style={{ fontSize: 12, color: '#a79fc0' }}>buy / sell activity</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Flow', 'Count', 'USDC', 'PICK', 'Winnings claimed', 'Winnings claimable'].map((h, i) => (
            <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '9px 14px', fontSize: 11, color: '#a79fc0', textTransform: 'uppercase' }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            <tr style={{ background: '#241b3a', fontWeight: 800 }}>
              <td style={{ padding: '9px 14px', fontSize: 11, color: '#a79fc0' }}>TOTAL</td>
              <td style={tdR}>{num(pick.buyPick.count + pick.sellPick.count)}</td>
              <td style={tdR}>${usdc(totUsdcRaw)}</td>
              <td style={tdR}>{usdc(totPickRaw)}</td>
              <td style={tdR}>{num(pick.winnings.claimedToken)}</td>
              <td style={tdR}>{num(pick.winnings.claimableToken)}</td>
            </tr>
            <tr onClick={() => openPickDrill('buy')} style={{ cursor: 'pointer' }}>
              <td style={{ padding: '9px 14px' }}><span style={{ ...chip, background: 'rgba(62,207,142,.15)', color: '#3ecf8e' }}>buyPick</span></td>
              <td style={tdR}>{num(pick.buyPick.count)}</td>
              <td style={tdR}>${usdc(pick.buyPick.usdcInRaw)}</td>
              <td style={tdR}>{usdc(pick.buyPick.pickIssuedRaw)}</td>
              <td style={tdR}>{num(pick.winnings.claimedToken)}</td>
              <td style={tdR}>{num(pick.winnings.claimableToken)}</td>
            </tr>
            <tr onClick={() => openPickDrill('sell')} style={{ cursor: 'pointer' }}>
              <td style={{ padding: '9px 14px' }}><span style={{ ...chip, background: 'rgba(255,107,107,.15)', color: '#ff6b6b' }}>sellPick</span></td>
              <td style={tdR}>{num(pick.sellPick.count)}</td>
              <td style={tdR}>${usdc(pick.sellPick.usdcOutRaw)}</td>
              <td style={tdR}>{usdc(pick.sellPick.pickReclaimedRaw)}</td>
              <td style={tdR}>—</td>
              <td style={tdR}>—</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Grant-risk (compact) */}
      <section style={{ background: '#1c1630', border: '1px solid #2f2547', borderRadius: 12, marginBottom: 18, padding: 16 }}>
        <b style={{ fontSize: 13 }}>🪙 PICK & grant-risk</b>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, fontSize: 13 }}>
          <div style={{ color: '#a79fc0' }}>Net USDC flow (out − in)</div>
          <div style={{ textAlign: 'right', fontWeight: 700, color: Number(pick.grantRisk.netPlatformFundedValueExtractedRaw) > 0 ? '#ff6b6b' : '#3ecf8e' }}>
            {Number(pick.grantRisk.netPlatformFundedValueExtractedRaw) >= 0 ? '' : '−'}${usdc(pick.grantRisk.netPlatformFundedValueExtractedRaw.replace('-', ''))}
          </div>
          <div style={{ color: '#a79fc0' }}>Promotional PICK granted</div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>{num(pick.grantRisk.promotionalPickReceived)} PICK (≈ ${num(pick.grantRisk.promotionalPickUsdcEquiv)})</div>
          <div style={{ color: '#a79fc0' }}>Winnings claimed</div>
          <div style={{ textAlign: 'right', fontWeight: 700 }}>{num(pick.grantRisk.claimedPickWinnings)} PICK</div>
        </div>
        <div style={{ fontSize: 11, color: '#a79fc0', marginTop: 8 }}>
          Net &gt; 0 = paid out more USDC than taken in. Valuation {pick.grantRisk.valuation.pickPerUsd} PICK/USD.
        </div>
      </section>

      <button onClick={downloadCsv} style={{
        width: '100%', padding: 14, borderRadius: 8, border: 'none', background: '#f5a623',
        color: '#221704', fontSize: 15, fontWeight: 800, cursor: 'pointer',
      }}>⬇ Export CSV (pivot-ready)</button>

      {drill && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setDrill(null); }} style={overlay}>
          <div style={{ ...modal, width: 'min(1000px,96vw)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, borderBottom: '1px solid #2f2547' }}>
              <b>🎯 {drill.result} predictions</b>
              {drill.filterUsername && (
                <span style={{ fontSize: 12, color: '#f5a623' }}>
                  filtered: {drill.filterUsername}{' '}
                  <span onClick={clearUserFilter} style={{ cursor: 'pointer' }}>✕</span>
                </span>
              )}
              <button onClick={() => setDrill(null)} style={{ marginLeft: 'auto', ...ghostBtn }}>Close</button>
            </div>
            <div style={{ padding: '12px 16px 0', fontSize: 12, color: '#a79fc0' }}>
              Showing <b style={{ color: '#ece8f5' }}>{drill.rows.length}</b> of <b style={{ color: '#ece8f5' }}>{num(drill.total)}</b> {drill.result} predictions.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['User', 'EOA (reg.)', 'Market', 'Side', 'Stake', 'Claimable', 'Claim state', 'Claim tx'].map((h, i) => (
                  <th key={h} style={{ textAlign: i > 3 ? 'right' : 'left', padding: '9px 14px', fontSize: 11, color: '#a79fc0', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  <tr style={{ background: '#241b3a', fontWeight: 800 }}>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#a79fc0' }}>TOTAL ({drill.rows.length})</td>
                    <td /><td /><td />
                    <td style={tdR}>{num(drill.rows.reduce((a, x) => a + (x.predictionAmount || 0), 0))}</td>
                    <td style={tdR}>{num(drill.rows.reduce((a, x) => a + (x.claimableToken || x.claimableCredit || 0), 0))}</td>
                    <td /><td />
                  </tr>
                  {drill.rows.map((x) => {
                    const eoa = x.user?.externalWalletAddress;
                    const market = x.prediction ? `${x.prediction.homeTeam?.name ?? '?'} v ${x.prediction.awayTeam?.name ?? '?'}` : '—';
                    return (
                      <tr key={x.id}>
                        <td onClick={() => setUserMenu({ userId: x.userId, username: x.user?.username ?? x.userId })}
                            style={{ padding: '9px 14px', color: '#7c5cff', cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                          {x.user?.username ?? x.userId}
                        </td>
                        <td className="mono" style={{ padding: '9px 14px', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, color: '#cac5d6' }}>
                          {eoa ? `${eoa.slice(0, 6)}…${eoa.slice(-4)}` : '—'}
                        </td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{market}</td>
                        <td style={{ padding: '9px 14px' }}>{x.selectedTeam}</td>
                        <td style={tdR}>{num(x.predictionAmount)}</td>
                        <td style={tdR}>{num(x.claimableToken || x.claimableCredit)}</td>
                        <td style={{ ...tdR }}>
                          <span style={{ ...chip, background: x.isClaimed ? 'rgba(124,92,255,.18)' : 'rgba(167,159,192,.15)', color: x.isClaimed ? '#b7a4ff' : '#a79fc0' }}>
                            {x.isClaimed ? 'claimed' : 'unclaimed'}
                          </span>
                        </td>
                        <td style={tdR}>
                          {x.claimTxHash
                            ? <a href={`https://kairos.kaiascan.io/tx/${x.claimTxHash}`} target="_blank" rel="noreferrer" style={{ color: '#7c5cff', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12 }}>{x.claimTxHash.slice(0, 8)}…</a>
                            : <span style={{ color: '#a79fc0' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {!drill.rows.length && <tr><td colSpan={8} style={{ padding: 16, color: '#a79fc0' }}>No rows.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {pickDrill && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setPickDrill(null); }} style={overlay}>
          <div style={modal}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, borderBottom: '1px solid #2f2547' }}>
              <b>🪙 {pickDrill.type === 'buy' ? 'buyPick' : 'sellPick'} transactions</b>
              <button onClick={() => setPickDrill(null)} style={{ marginLeft: 'auto', ...ghostBtn }}>Close</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['User', 'USDC', 'PICK', 'Status', 'Tx'].map((h, i) => (
                  <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '9px 14px', fontSize: 11, color: '#a79fc0' }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {pickDrill.rows.map((x) => {
                    const tx = x.txHash as string | null;
                    const pickRaw = pickDrill.type === 'buy' ? x.pickIssued : x.pickReclaimed;
                    return (
                      <tr key={x.id}>
                        <td onClick={() => setUserMenu({ userId: x.userId, username: x.user?.username ?? x.userId })}
                            style={{ padding: '9px 14px', color: '#7c5cff', cursor: 'pointer', textDecoration: 'underline' }}>
                          {x.user?.username ?? x.userId}
                        </td>
                        <td style={tdR}>${usdc(String(x.rawAmount))}</td>
                        <td style={tdR}>{pickRaw ? usdc(String(pickRaw)) : '—'}</td>
                        <td style={tdR}>{x.status}</td>
                        <td style={tdR}>
                          {tx ? <a href={`https://polygonscan.com/tx/${tx}`} target="_blank" rel="noreferrer" style={{ color: '#7c5cff' }}>{tx.slice(0, 8)}…</a> : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {!pickDrill.rows.length && <tr><td colSpan={5} style={{ padding: 16, color: '#a79fc0' }}>No rows.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {userView && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setUserView(null); }} style={overlay}>
          <div style={modal}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, borderBottom: '1px solid #2f2547' }}>
              <b>👤 {userView.user?.username ?? userView.user?.id}</b>
              <button onClick={() => setUserView(null)} style={{ marginLeft: 'auto', ...ghostBtn }}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 16 }}>
              {u360('Registered EOA', userView.user?.externalWalletAddress ?? '—')}
              {u360('Predictions W / L',
                `${userView.predictions?.rows?.find((r: any) => r.result === 'WIN')?.count ?? 0} / ` +
                `${userView.predictions?.rows?.find((r: any) => r.result === 'LOSE')?.count ?? 0}`)}
              {u360('Volume', `${num(userView.predictions?.totals?.volume ?? 0)} PICK`)}
              {u360('USDC in / out', `$${usdc(userView.pick?.buyPick?.usdcInRaw ?? '0')} / $${usdc(userView.pick?.sellPick?.usdcOutRaw ?? '0')}`)}
              {u360('Promo PICK', `${num(userView.pick?.grantRisk?.promotionalPickReceived ?? 0)} PICK`)}
              {u360('IDs on same reg. EOA', String((userView.linkedByEoa ?? []).length))}
            </div>
            {(userView.linkedByEoa ?? []).length > 0 && (
              <div style={{ padding: '0 16px 16px', fontSize: 12, color: '#ff6b6b' }}>
                🛡 {userView.linkedByEoa.length} other ID(s) share this registered EOA — defense-in-depth flag.
              </div>
            )}
            <div style={{ padding: '0 16px 16px', fontSize: 11, color: '#a79fc0' }}>
              Focused summary. Behavioural linked-account detection is deferred.
            </div>
          </div>
        </div>
      )}

      {userMenu && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setUserMenu(null); }} style={overlay}>
          <div style={{ ...modal, width: 'min(340px,92vw)' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2f2547', fontSize: 12, color: '#a79fc0' }}>
              user: <b style={{ color: '#ece8f5' }}>{userMenu.username}</b>
            </div>
            <div onClick={() => applyUserFilter(userMenu.userId, userMenu.username)} style={menuItem}>🔎 Filter this list by this user</div>
            <div onClick={() => openUserView(userMenu.userId)} style={{ ...menuItem, borderBottom: 'none' }}>👤 Open full view</div>
          </div>
        </div>
      )}
    </div>
  );
}

const u360 = (label: string, value: string) => (
  <div style={{ background: '#241b3a', border: '1px solid #2f2547', borderRadius: 10, padding: 12 }}>
    <div style={{ fontSize: 11, color: '#a79fc0' }}>{label}</div>
    <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, wordBreak: 'break-all' }}>{value}</div>
  </div>
);

const tdR: CSSProperties = { textAlign: 'right', padding: '9px 14px', fontVariantNumeric: 'tabular-nums', fontWeight: 700 };
const chip: CSSProperties = { display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 };
const menuItem: CSSProperties = { padding: '12px 16px', fontSize: 14, cursor: 'pointer', borderBottom: '1px solid #2f2547' };
const overlay: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflow: 'auto', zIndex: 50 };
const modal: CSSProperties = { background: '#1c1630', border: '1px solid #2f2547', borderRadius: 14, width: 'min(720px,96vw)' };
const ghostBtn: CSSProperties = { background: 'transparent', border: '1px solid #2f2547', color: '#ece8f5', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' };
