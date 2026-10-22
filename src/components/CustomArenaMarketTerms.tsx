import type { CustomArenaMarket } from '../types/CustomArena';

export default function CustomArenaMarketTerms({ market }: { market: CustomArenaMarket }) {
  return (
    <div className="custom-arena-market-terms">
      <section>
        <h4>Resolves Yes when</h4>
        <p>{market.yesSemantics || 'No Yes settlement terms were recorded for this market.'}</p>
      </section>
      <section>
        <h4>Resolves No when</h4>
        <p>{market.noSemantics || 'No No settlement terms were recorded for this market.'}</p>
      </section>
      <section>
        <h4>Resolution rules</h4>
        {market.resolutionRules?.length ? (
          <ul>{market.resolutionRules.map((rule, index) => <li key={index}>{rule}</li>)}</ul>
        ) : <p>No resolution rules were recorded for this market.</p>}
      </section>
      <section>
        <h4>Void conditions</h4>
        {market.voidConditions?.length ? (
          <ul>{market.voidConditions.map((rule, index) => <li key={index}>{rule}</li>)}</ul>
        ) : <p>No separate void conditions were recorded. Check the resolution rules for any void terms.</p>}
        <p className="custom-arena-refund-note">If the market is void, <strong>your holding position is refunded.</strong> The position fee is not refunded.</p>
      </section>
    </div>
  );
}
