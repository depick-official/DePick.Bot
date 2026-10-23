import { useEffect, useState, CSSProperties } from 'react';
import {
  reportingApi,
  ModeratorCommunity,
  ReportingScope,
  PredictionsSummary,
  PickSummary,
  OutflowWatch,
  UNASSIGNED_SCOPE,
} from '../services/api';
import '../styles/pages.scss';

/**
 * Franchise dashboard — opened via `/dashboard`. Moderators see their own
 * community (fixed). dePick super-admins additionally get a dePick/Moderator
 * toggle and an all-communities selector (server-elevated over the same user
 * JWT). See docs/WIP/franchise-reporting/ARCHITECTURE.md §12.
 */
const RESULT_COLORS: Record<string, string> = {
  WIN: '#3ecf8e', LOSE: '#ff6b6b', TIE: '#ffd166', ON_GOING: '#8ab4ff',
};
const num = (n: number) => Math.round(n || 0).toLocaleString('en-US');
const money = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

type SortState = { key: string; dir: 'asc' | 'desc' };
function sortVal(row: any, key: string): number | string {
  switch (key) {
    case 'user': return (row.user?.username ?? row.userId ?? '').toString().toLowerCase();
    case 'mkt': return row.prediction ? `${row.prediction.homeTeam?.name ?? ''} v ${row.prediction.awayTeam?.name ?? ''}` : '';
    case 'side': return row.selectedTeam ?? '';
    case 'stake': return row.predictionAmount ?? 0;
    case 'claimable': return row.claimableToken || row.claimableCredit || 0;
    case 'usdc': return row.usdcHuman ?? -1; // nulls sort last on desc
    case 'pick': return row.pickHuman ?? 0;
    case 'status': return row.status ?? '';
    default: return 0;
  }
}
function sortRows(rows: any[], s: SortState): any[] {
  return [...rows].sort((a, b) => {
    const va = sortVal(a, s.key), vb = sortVal(b, s.key);
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return s.dir === 'asc' ? c : -c;
  });
}
type Col = { label: string; key?: string; align: 'left' | 'right' };
function sortableHead(cols: Col[], s: SortState, setS: (u: (p: SortState) => SortState) => void) {
  return (
    <thead><tr>{cols.map((c) => (
      <th key={c.label}
          onClick={c.key ? () => setS((p) => ({ key: c.key!, dir: p.key === c.key && p.dir === 'desc' ? 'asc' : 'desc' })) : undefined}
          style={{ textAlign: c.align, padding: '9px 14px', fontSize: 11, color: '#a79fc0', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: c.key ? 'pointer' : 'default', userSelect: 'none' }}>
        {c.label}{c.key && s.key === c.key ? (s.dir === 'desc' ? ' ▼' : ' ▲') : ''}
      </th>
    ))}</tr></thead>
  );
}

export default function ModeratorPortalPage() {
  const [scope, setScope] = useState<ReportingScope | null>(null);
  const [view, setView] = useState<'moderator' | 'depick'>('moderator');
  const [selCommunityId, setSelCommunityId] = useState<string>('all'); // dePick-view selection
  const [pred, setPred] = useState<PredictionsSummary | null>(null);
  const [pick, setPick] = useState<PickSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<{ result: string; rows: any[]; total: number; filterUserId?: string; filterUsername?: string } | null>(null);
  const [userView, setUserView] = useState<any | null>(null);
  const [userMenu, setUserMenu] = useState<{ userId: string; username: string } | null>(null);
  const [pickDrill, setPickDrill] = useState<{ type: 'buy' | 'sell'; rows: any[]; filterUserId?: string; filterUsername?: string } | null>(null);
  const [drillSort, setDrillSort] = useState<SortState>({ key: 'stake', dir: 'desc' }); // predictions: volume desc
  const [pickSort, setPickSort] = useState<SortState>({ key: 'usdc', dir: 'desc' });     // pick: USDC desc
  const [predClaim, setPredClaim] = useState<'all' | 'claimed' | 'unclaimed'>('all'); // predictions claim-state filter
  const [pickStatus, setPickStatus] = useState<string>('all'); // buyPick/sellPick status filter
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all' | 'custom'>('all'); // default All (user-confirmed 2026-08-30)
  const [fromDate, setFromDate] = useState<string>(''); // YYYY-MM-DD (custom range)
  const [toDate, setToDate] = useState<string>('');
  const [outflow, setOutflow] = useState<OutflowWatch | null>(null);

  // Load scope (who am I, what can I see).
  useEffect(() => {
    reportingApi
      .communities()
      .then((s) => {
        setScope(s);
        if (!s.communities.length && !s.isSuperAdmin) { setError('You don’t manage a community yet.'); return; }
        if (!s.communities.length && s.isSuperAdmin) setView('depick'); // no own group → start in dePick view
      })
      .catch((e: any) => setError(e?.response?.data?.message ?? e?.message ?? 'Could not load your dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  const ownCommunity = scope?.communities[0] ?? null;
  const activeCommunity: ModeratorCommunity | null = !scope
    ? null
    : view === 'moderator'
      ? ownCommunity
      : selCommunityId === 'all' ? null : scope.allCommunities?.find((c) => c.id === selCommunityId) ?? null;
  const activeCommunityId = view === 'moderator' ? ownCommunity?.id : (selCommunityId === 'all' ? undefined : selCommunityId);
  const feeBps = activeCommunity?.feeBps ?? 0;
  // Overview filters — `claimed` scopes predictions, `status` scopes buyPick/sellPick.
  // Both are carried on every call; the backend ignores the one that doesn't apply to
  // its dataset, so drilldowns stay consistent with the filtered summary.
  const claimParam = predClaim !== 'all' ? { claimed: predClaim } : {};
  const statusParam = pickStatus !== 'all' ? { status: pickStatus } : {};
  // Time-range filter → from/to. Presets compute from = now − Nd; custom uses the
  // date inputs (to sent end-of-day so the "to" day is inclusive; BE uses `lte`).
  const rangeParam: Record<string, string> = (() => {
    if (range === 'custom') {
      const p: Record<string, string> = {};
      if (fromDate) p.from = new Date(fromDate + 'T00:00:00').toISOString();
      if (toDate) p.to = new Date(toDate + 'T23:59:59.999').toISOString();
      return p;
    }
    if (range === 'all') return {};
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    return { from: new Date(Date.now() - days * 86_400_000).toISOString() };
  })();
  const reportParams = (extra: Record<string, any> = {}) => ({ ...(activeCommunityId ? { communityId: activeCommunityId } : {}), ...claimParam, ...statusParam, ...rangeParam, ...extra });

  // This dashboard is desktop-friendly — break out of the app's 420px phone
  // frame (#root max-width) while it's mounted; restore for other pages.
  useEffect(() => {
    const root = document.getElementById('root');
    root?.classList.add('root-wide');
    return () => root?.classList.remove('root-wide');
  }, []);

  // (Re)load summaries when the effective scope changes.
  useEffect(() => {
    if (!scope) return;
    if (view === 'moderator' && !ownCommunity) return;
    let cancelled = false;
    setPred(null); setPick(null);
    const cid = view === 'moderator' ? ownCommunity?.id : (selCommunityId === 'all' ? undefined : selCommunityId);
    const base = { ...(cid ? { communityId: cid } : {}), ...rangeParam };
    const predParams = { ...base, ...(predClaim !== 'all' ? { claimed: predClaim } : {}) };
    const pickParams = { ...base, ...(pickStatus !== 'all' ? { status: pickStatus } : {}) };
    Promise.all([reportingApi.predictionsSummary(predParams), reportingApi.pickSummary(pickParams)])
      .then(([p, k]) => { if (!cancelled) { setPred(p); setPick(k); } })
      .catch((e: any) => { if (!cancelled) setError(e?.response?.data?.message ?? e?.message ?? 'Could not load.'); });
    return () => { cancelled = true; };
  }, [scope, view, selCommunityId, predClaim, pickStatus, range, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // dePick outflow-watch — per-community rollup (super-view only; hidden in moderator view).
  useEffect(() => {
    if (!scope?.isSuperAdmin || view !== 'depick') { setOutflow(null); return; }
    let cancelled = false;
    reportingApi.outflowWatch(reportParams())
      .then((o) => { if (!cancelled) setOutflow(o); })
      .catch(() => { if (!cancelled) setOutflow(null); });
    return () => { cancelled = true; };
  }, [scope, view, selCommunityId, range, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDrill = async (result: string) => {
    const r = await reportingApi.predictions(reportParams({ result, limit: 100 }));
    setDrill({ result, rows: r.items, total: r.total });
  };
  const openUserView = async (id: string) => {
    setUserMenu(null);
    try { setUserView(await reportingApi.userSummary(id)); } catch { /* fenced/missing */ }
  };
  // Filter the *active* drilldown (predictions or PICK) to one user.
  const applyUserFilter = async (userId: string, username: string) => {
    setUserMenu(null);
    if (pickDrill) {
      const r = await reportingApi.pick(reportParams({ type: pickDrill.type, userId, limit: 100 }));
      setPickDrill({ ...pickDrill, rows: r.items, filterUserId: userId, filterUsername: username });
      return;
    }
    if (drill) {
      const r = await reportingApi.predictions(reportParams({ result: drill.result, userId, limit: 100 }));
      setDrill({ ...drill, rows: r.items, total: r.total, filterUserId: userId, filterUsername: username });
    }
  };
  const clearUserFilter = async () => {
    if (pickDrill) {
      const r = await reportingApi.pick(reportParams({ type: pickDrill.type, limit: 100 }));
      setPickDrill({ ...pickDrill, rows: r.items, filterUserId: undefined, filterUsername: undefined });
      return;
    }
    if (drill) {
      const r = await reportingApi.predictions(reportParams({ result: drill.result, limit: 100 }));
      setDrill({ ...drill, rows: r.items, total: r.total, filterUserId: undefined, filterUsername: undefined });
    }
  };
  const openPickDrill = async (type: 'buy' | 'sell') => {
    const r = await reportingApi.pick(reportParams({ type, limit: 100 }));
    setPickDrill({ type, rows: r.items });
  };
  const downloadCsv = async () => {
    const save = (csv: string, name: string) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    // Two separate files — predictions and PICK transactions have different columns.
    const [preds, picks] = await Promise.all([
      reportingApi.exportCsv(reportParams({ dataset: 'predictions' })),
      reportingApi.exportCsv(reportParams({ dataset: 'pick-transactions' })),
    ]);
    save(preds, 'predictions.csv');
    setTimeout(() => save(picks, 'pick-transactions.csv'), 150); // stagger so both downloads fire
  };

  if (loading) return <div className="container"><div className="loading">Loading your dashboard…</div></div>;
  if (error) return <div className="container"><div className="error">{error}</div></div>;
  if (!scope) return <div className="container"><div className="error">No data.</div></div>;
  if (!pred || !pick) return <div className="container"><div className="loading">Loading…</div></div>;

  const commission = pred.commission;
  const totUsdc = pick.buyPick.usdcIn + pick.sellPick.usdcOut;
  const totPick = pick.buyPick.pickIssued + pick.sellPick.pickReclaimed;

  const isUnassigned = selCommunityId === UNASSIGNED_SCOPE;
  const title = view === 'depick'
    ? (isUnassigned ? '(Unassigned)' : activeCommunity?.displayName ?? 'All communities')
    : (ownCommunity?.displayName ?? 'Your community');
  const subtitle = view === 'depick'
    ? (isUnassigned
        ? 'dePick view · users with no home community · read-only'
        : activeCommunity
        ? `dePick view · ${activeCommunity.scopeProvider === 'DISCORD' ? 'Discord' : 'Telegram'} · fee ${(feeBps / 100).toFixed(1)}%`
        : 'dePick view · all communities · read-only')
    : `${ownCommunity?.scopeProvider === 'DISCORD' ? 'Discord' : 'Telegram'} · volume fee ${(feeBps / 100).toFixed(1)}% · read-only`;

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
    <div className="container" style={{ maxWidth: 1200, width: '100%', margin: '0 auto' }}>
      {scope.isSuperAdmin && (
        <div style={toggleWrap}>
          <button onClick={() => setView('depick')} style={view === 'depick' ? toggleActive : toggleBtn}>dePick view</button>
          <button onClick={() => setView('moderator')} disabled={!ownCommunity}
                  style={view === 'moderator' ? toggleActive : { ...toggleBtn, opacity: ownCommunity ? 1 : 0.4 }}>Moderator view</button>
        </div>
      )}

      <div className="header">
        <h1>📊 {title}</h1>
        <p>{subtitle}</p>
        {view === 'depick' && scope.allCommunities && (
          <select value={selCommunityId} onChange={(e) => setSelCommunityId(e.target.value)}
                  style={{ background: '#241b3a', border: '1px solid #2f2547', color: '#ece8f5', borderRadius: 8, padding: '8px 11px', fontSize: 13, marginTop: 6 }}>
            <option value="all">All communities</option>
            {scope.allCommunities.map((c) => (
              <option key={c.id} value={c.id}>{c.displayName ?? c.id.slice(0, 8)} ({c.scopeProvider === 'DISCORD' ? 'Discord' : 'Telegram'})</option>
            ))}
            <option value={UNASSIGNED_SCOPE}>(Unassigned — no home community)</option>
          </select>
        )}
      </div>

      {/* Time-range filter — narrows every panel + all totals. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: '#a79fc0', textTransform: 'uppercase' }}>Range</span>
        <div style={{ display: 'inline-flex', background: '#241b3a', border: '1px solid #2f2547', borderRadius: 10, overflow: 'hidden' }}>
          {(['7d', '30d', '90d', 'all'] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              style={{ background: range === r ? '#f5a623' : 'transparent', color: range === r ? '#221704' : '#a79fc0',
                border: 0, padding: '6px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: '#a79fc0', marginLeft: 4 }}>From</span>
        <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setRange('custom'); }}
          style={dateInput} />
        <span style={{ fontSize: 11, color: '#a79fc0' }}>To</span>
        <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setRange('custom'); }}
          style={dateInput} />
        <button onClick={downloadCsv} style={{ marginLeft: 'auto', background: '#f5a623', color: '#221704', border: 0, borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          ⬇ Export CSV
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
        {card('Prediction volume', `${num(pred.totals.volume)} PICK`, `${num(pred.totals.count)} predictions`, true)}
        {card('Commission', commission ? `${num(commission.payableCommission)} PICK` : '—',
          commission ? `≈ ${num(commission.estimatedCommission)} incl. open` : 'select a community', true)}
        {card('buyPick (USDC in)', `$${money(pick.buyPick.usdcIn)}`, `${pick.buyPick.count} deposits`)}
        {card('sellPick (USDC out)', `$${money(pick.sellPick.usdcOut)}`, `${pick.sellPick.count} withdrawals`)}
        {(() => {
          const net = pick.buyPick.usdcIn - pick.sellPick.usdcOut; // + = net inflow
          return (
            <div style={{ background: '#1c1630', border: '1px solid #2f2547', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#a79fc0' }}>Net USDC flow</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: net >= 0 ? '#3ecf8e' : '#ff6b6b' }}>
                {net >= 0 ? '+' : '−'}${money(Math.abs(net))}
              </div>
              <div style={{ fontSize: 12, color: '#a79fc0', marginTop: 4 }}>free PICK granted ≈ {num(pick.grantRisk.promotionalPickReceived)}</div>
            </div>
          );
        })()}
      </div>

      {/* dePick USDC outflow watch — per-community fraud/exposure rollup (super-view only) */}
      {outflow && (
        <section style={{ background: '#1c1630', border: '1px solid #2f2547', borderRadius: 12, marginBottom: 18, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #2f2547' }}>
            <b>💸 USDC outflow watch</b>{' '}
            <span style={{ fontSize: 12, color: '#a79fc0' }}>click a community to focus · net &lt; 0 = paid out more than taken in</span>
          </div>
          <div style={scrollX}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead><tr>{['Community', 'Users', 'USDC in', 'USDC out', 'Net', 'Free PICK', 'Fee'].map((h, i) => (
                <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '9px 14px', fontSize: 11, color: '#a79fc0', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                <tr style={{ background: '#241b3a', fontWeight: 800 }}>
                  <td style={{ padding: '9px 14px', fontSize: 11, color: '#a79fc0' }}>TOTAL ({outflow.rows.length})</td>
                  <td style={tdR}>{num(outflow.totals.users)}</td>
                  <td style={tdR}>${money(outflow.totals.usdcIn)}</td>
                  <td style={tdR}>${money(outflow.totals.usdcOut)}</td>
                  <td style={{ ...tdR, color: outflow.totals.net >= 0 ? '#3ecf8e' : '#ff6b6b' }}>
                    {outflow.totals.net >= 0 ? '+' : '−'}${money(Math.abs(outflow.totals.net))}
                  </td>
                  <td style={tdR}>{num(outflow.totals.freePick)}</td>
                  <td style={tdR}>—</td>
                </tr>
                {outflow.rows.map((r) => {
                  const denom = r.usdcIn + r.usdcOut;
                  const outPct = denom > 0 ? Math.round((r.usdcOut / denom) * 100) : 0;
                  return (
                    <tr key={r.communityId} onClick={() => setSelCommunityId(r.communityId)} style={{ cursor: 'pointer' }}>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ color: '#7c5cff', textDecoration: 'underline', whiteSpace: 'nowrap' }}>{r.displayName}</div>
                        {/* in/out ratio bar: green = kept (in), red = paid out */}
                        <div style={{ marginTop: 5, height: 5, width: 120, borderRadius: 3, overflow: 'hidden', background: '#3ecf8e' }}>
                          <div style={{ height: '100%', width: `${outPct}%`, marginLeft: `${100 - outPct}%`, background: '#ff6b6b' }} />
                        </div>
                      </td>
                      <td style={tdR}>{num(r.users)}</td>
                      <td style={{ ...tdR, color: '#3ecf8e' }}>${money(r.usdcIn)}</td>
                      <td style={{ ...tdR, color: '#ff6b6b' }}>${money(r.usdcOut)}</td>
                      <td style={{ ...tdR, color: r.net >= 0 ? '#3ecf8e' : '#ff6b6b' }}>
                        {r.net >= 0 ? '+' : '−'}${money(Math.abs(r.net))}
                      </td>
                      <td style={tdR}>{num(r.freePick)}</td>
                      <td style={tdR}>{r.communityId === UNASSIGNED_SCOPE ? '—' : `${(r.feeBps / 100).toFixed(1)}%`}</td>
                    </tr>
                  );
                })}
                {!outflow.rows.length && <tr><td colSpan={7} style={{ padding: 16, color: '#a79fc0' }}>No communities.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Predictions — the commission source */}
      <section style={{ background: '#1c1630', border: '1px solid #2f2547', borderRadius: 12, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #2f2547', display: 'flex', gap: 8, alignItems: 'center' }}>
          <b>🎯 Predictions</b>
          {commission && <span style={{ fontSize: 11, color: '#f5a623', border: '1px solid #f5a623', borderRadius: 20, padding: '2px 8px' }}>commission source</span>}
          <select value={predClaim} onChange={(e) => setPredClaim(e.target.value as any)}
            title="Filter by claim state"
            style={{ marginLeft: 'auto', background: '#241b3a', color: '#e8e3f5', border: '1px solid #2f2547', borderRadius: 8, padding: '4px 8px', fontSize: 12 }}>
            <option value="all">All predictions</option>
            <option value="claimed">Claimed only</option>
            <option value="unclaimed">Unclaimed only</option>
          </select>
          <span style={{ fontSize: 12, color: '#a79fc0', marginLeft: 8 }}>tap a row</span>
        </div>
        <div style={scrollX}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead><tr>{['Outcome', 'Count', 'Volume', 'Fee', 'Claimable', 'Unclaimed'].map((h, i) => (
            <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '9px 14px', fontSize: 11, color: '#a79fc0', textTransform: 'uppercase' }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            <tr style={{ background: '#241b3a', fontWeight: 800 }}>
              <td style={{ padding: '9px 14px', fontSize: 11, color: '#a79fc0' }}>TOTAL</td>
              <td style={tdR}>{num(pred.totals.count)}</td>
              <td style={tdR}>{num(pred.totals.volume)}</td>
              <td style={{ ...tdR, color: '#f5a623' }}>{activeCommunity ? num(pred.eligibility.payableVolume * feeBps / 10000) : '—'}</td>
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
                <td style={{ ...tdR, color: '#f5a623' }}>{activeCommunity ? num(r.volume * feeBps / 10000) : '—'}</td>
                <td style={tdR}>{num(r.claimableToken)}</td>
                <td style={tdR}>{num(r.unclaimedToken)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {/* PICK transactions table */}
      <section style={{ background: '#1c1630', border: '1px solid #2f2547', borderRadius: 12, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #2f2547', display: 'flex', gap: 8, alignItems: 'center' }}>
          <b>🪙 PICK transactions</b> <span style={{ fontSize: 12, color: '#a79fc0' }}>buy / sell activity</span>
          <select value={pickStatus} onChange={(e) => setPickStatus(e.target.value)}
            title="Filter by transaction status"
            style={{ marginLeft: 'auto', background: '#241b3a', color: '#e8e3f5', border: '1px solid #2f2547', borderRadius: 8, padding: '4px 8px', fontSize: 12 }}>
            <option value="all">All statuses</option>
            <optgroup label="buyPick (deposit)">
              {['PENDING_SIGN', 'BROADCAST', 'CONFIRMED', 'CREDITING', 'CREDITED', 'DROPPED', 'MANUAL_REVIEW'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </optgroup>
            <optgroup label="sellPick (withdrawal)">
              {['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div style={scrollX}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead><tr>{['Flow', 'Count', 'USDC', 'PICK', 'Winnings claimed', 'Winnings claimable'].map((h, i) => (
            <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '9px 14px', fontSize: 11, color: '#a79fc0', textTransform: 'uppercase' }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            <tr style={{ background: '#241b3a', fontWeight: 800 }}>
              <td style={{ padding: '9px 14px', fontSize: 11, color: '#a79fc0' }}>TOTAL</td>
              <td style={tdR}>{num(pick.buyPick.count + pick.sellPick.count)}</td>
              <td style={tdR}>${money(totUsdc)}</td>
              <td style={tdR}>{num(totPick)}</td>
              <td style={tdR}>{num(pick.winnings.claimedToken)}</td>
              <td style={tdR}>{num(pick.winnings.claimableToken)}</td>
            </tr>
            <tr onClick={() => openPickDrill('buy')} style={{ cursor: 'pointer' }}>
              <td style={{ padding: '9px 14px' }}><span style={{ ...chip, background: 'rgba(62,207,142,.15)', color: '#3ecf8e' }}>buyPick</span></td>
              <td style={tdR}>{num(pick.buyPick.count)}</td>
              <td style={tdR}>${money(pick.buyPick.usdcIn)}</td>
              <td style={tdR}>{num(pick.buyPick.pickIssued)}</td>
              <td style={tdR}>{num(pick.winnings.claimedToken)}</td>
              <td style={tdR}>{num(pick.winnings.claimableToken)}</td>
            </tr>
            <tr onClick={() => openPickDrill('sell')} style={{ cursor: 'pointer' }}>
              <td style={{ padding: '9px 14px' }}><span style={{ ...chip, background: 'rgba(255,107,107,.15)', color: '#ff6b6b' }}>sellPick</span></td>
              <td style={tdR}>{num(pick.sellPick.count)}</td>
              <td style={tdR}>${money(pick.sellPick.usdcOut)}</td>
              <td style={tdR}>{num(pick.sellPick.pickReclaimed)}</td>
              <td style={tdR}>—</td>
              <td style={tdR}>—</td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>

      {/* Grant-risk (compact) */}
      <section style={{ background: '#1c1630', border: '1px solid #2f2547', borderRadius: 12, marginBottom: 18, padding: 16 }}>
        <b style={{ fontSize: 13 }}>🪙 PICK & grant-risk</b>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10, fontSize: 13 }}>
          <div style={{ color: '#a79fc0' }}>Net USDC flow (out − in)</div>
          <div style={{ textAlign: 'right', fontWeight: 700, color: pick.grantRisk.netPlatformFundedValueExtracted > 0 ? '#ff6b6b' : '#3ecf8e' }}>
            {pick.grantRisk.netPlatformFundedValueExtracted < 0 ? '−' : ''}${money(Math.abs(pick.grantRisk.netPlatformFundedValueExtracted))}
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

      {drill && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setDrill(null); }} style={overlay}>
          <div style={{ ...modal, width: 'min(1000px,96vw)' }}>
            <div style={modalHead}>
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
            <div style={scrollX}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {sortableHead([
                  { label: 'User', key: 'user', align: 'left' },
                  { label: 'EOA (reg.)', align: 'left' },
                  { label: 'Market', key: 'mkt', align: 'left' },
                  { label: 'Side', key: 'side', align: 'left' },
                  { label: 'Stake', key: 'stake', align: 'right' },
                  { label: 'Claimable', key: 'claimable', align: 'right' },
                  { label: 'Claim state', align: 'right' },
                  { label: 'Claim tx', align: 'right' },
                ], drillSort, setDrillSort)}
                <tbody>
                  <tr style={{ background: '#241b3a', fontWeight: 800 }}>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#a79fc0' }}>TOTAL ({drill.rows.length})</td>
                    <td /><td /><td />
                    <td style={tdR}>{num(drill.rows.reduce((a, x) => a + (x.predictionAmount || 0), 0))}</td>
                    <td style={tdR}>{num(drill.rows.reduce((a, x) => a + (x.claimableToken || x.claimableCredit || 0), 0))}</td>
                    <td /><td />
                  </tr>
                  {sortRows(drill.rows, drillSort).map((x) => {
                    const eoa = x.user?.externalWalletAddress;
                    const market = x.prediction ? `${x.prediction.homeTeam?.name ?? '?'} v ${x.prediction.awayTeam?.name ?? '?'}` : '—';
                    return (
                      <tr key={x.id}>
                        <td onClick={() => setUserMenu({ userId: x.userId, username: x.user?.username ?? x.userId })}
                            style={{ padding: '9px 14px', color: '#7c5cff', cursor: 'pointer', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                          {x.user?.username ?? x.userId}
                        </td>
                        <td style={{ padding: '9px 14px', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, color: '#cac5d6' }}>
                          {eoa ? `${eoa.slice(0, 6)}…${eoa.slice(-4)}` : '—'}
                        </td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{market}</td>
                        <td style={{ padding: '9px 14px' }}>{x.selectedTeam}</td>
                        <td style={tdR}>{num(x.predictionAmount)}</td>
                        <td style={tdR}>{num(x.claimableToken || x.claimableCredit)}</td>
                        <td style={tdR}>
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
            <div style={modalHead}>
              <b>🪙 {pickDrill.type === 'buy' ? 'buyPick' : 'sellPick'} transactions</b>
              {pickDrill.filterUsername && (
                <span style={{ fontSize: 12, color: '#f5a623' }}>
                  filtered: {pickDrill.filterUsername}{' '}
                  <span onClick={clearUserFilter} style={{ cursor: 'pointer' }}>✕</span>
                </span>
              )}
              <button onClick={() => setPickDrill(null)} style={{ marginLeft: 'auto', ...ghostBtn }}>Close</button>
            </div>
            <div style={scrollX}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {sortableHead([
                  { label: 'User', key: 'user', align: 'left' },
                  { label: 'USDC', key: 'usdc', align: 'right' },
                  { label: 'PICK', key: 'pick', align: 'right' },
                  { label: 'Status', key: 'status', align: 'right' },
                  { label: 'Tx', align: 'right' },
                ], pickSort, setPickSort)}
                <tbody>
                  <tr style={{ background: '#241b3a', fontWeight: 800 }}>
                    <td style={{ padding: '9px 14px', fontSize: 11, color: '#a79fc0' }}>TOTAL ({pickDrill.rows.length})</td>
                    <td style={tdR}>${money(pickDrill.rows.reduce((a, x) => a + (x.usdcHuman || 0), 0))}</td>
                    <td style={tdR}>{num(pickDrill.rows.reduce((a, x) => a + (x.pickHuman || 0), 0))}</td>
                    <td /><td />
                  </tr>
                  {sortRows(pickDrill.rows, pickSort).map((x) => {
                    const tx = x.txHash as string | null;
                    return (
                      <tr key={x.id}>
                        <td onClick={() => setUserMenu({ userId: x.userId, username: x.user?.username ?? x.userId })}
                            style={{ padding: '9px 14px', color: '#7c5cff', cursor: 'pointer', textDecoration: 'underline' }}>
                          {x.user?.username ?? x.userId}
                        </td>
                        <td style={tdR}>{x.usdcHuman == null ? '—' : `$${money(x.usdcHuman)}`}</td>
                        <td style={tdR}>{num(x.pickHuman)}</td>
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
            <div style={modalHead}>
              <b>👤 {userView.user?.username ?? userView.user?.id}</b>
              <button onClick={() => setUserView(null)} style={{ marginLeft: 'auto', ...ghostBtn }}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 16 }}>
              {u360('Registered EOA', userView.user?.externalWalletAddress ?? '—')}
              {u360('Predictions W / L',
                `${userView.predictions?.rows?.find((r: any) => r.result === 'WIN')?.count ?? 0} / ` +
                `${userView.predictions?.rows?.find((r: any) => r.result === 'LOSE')?.count ?? 0}`)}
              {u360('Volume', `${num(userView.predictions?.totals?.volume ?? 0)} PICK`)}
              {u360('USDC in / out', `$${money(userView.pick?.buyPick?.usdcIn ?? 0)} / $${money(userView.pick?.sellPick?.usdcOut ?? 0)}`)}
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
const modal: CSSProperties = { background: '#1c1630', border: '1px solid #2f2547', borderRadius: 14, width: 'min(720px,96vw)', maxHeight: '90vh', overflowY: 'auto' };
// Horizontal scroll wrapper for wide drilldown tables (touch momentum on iOS).
const scrollX: CSSProperties = { overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as CSSProperties;
// Modal header that stays pinned while the modal body scrolls vertically.
const modalHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: 16, borderBottom: '1px solid #2f2547', position: 'sticky', top: 0, background: '#1c1630', zIndex: 1 };
const ghostBtn: CSSProperties = { background: 'transparent', border: '1px solid #2f2547', color: '#ece8f5', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' };
const dateInput: CSSProperties = { background: '#241b3a', border: '1px solid #2f2547', color: '#ece8f5', borderRadius: 8, padding: '5px 8px', fontSize: 12, colorScheme: 'dark' } as CSSProperties;
const toggleWrap: CSSProperties = { display: 'inline-flex', background: '#241b3a', border: '1px solid #2f2547', borderRadius: 10, overflow: 'hidden', marginBottom: 14 };
const toggleBtn: CSSProperties = { background: 'transparent', border: 0, color: '#a79fc0', padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const toggleActive: CSSProperties = { ...toggleBtn, background: '#f5a623', color: '#221704' };
