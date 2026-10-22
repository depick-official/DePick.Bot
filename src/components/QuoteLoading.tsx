export default function QuoteLoading() {
  return (
    <span className="quote-loading" role="status">
      Loading quote
      <span className="quote-loading-dots" aria-hidden="true"><i /><i /><i /></span>
    </span>
  );
}
