import { FormEvent, useEffect, useState } from 'react';
import { customArenaApi } from '../services/api';
import {
  CustomArenaProposal,
  CustomArenaProposalResponse,
  CustomArenaReservePreview,
  CustomArenaScope,
} from '../types/CustomArena';
import '../styles/modal.scss';

type CreateStep = 'input' | 'loading' | 'clarification' | 'review' | 'creating' | 'success';

interface CustomArenaCreateModalProps {
  communityId: string;
  scope: CustomArenaScope;
  availableCapacityPick: number;
  defaultMarketDepthPick: number;
  onClose: () => void;
  onCreated: () => void;
}

export default function CustomArenaCreateModal({
  communityId,
  scope,
  availableCapacityPick,
  defaultMarketDepthPick,
  onClose,
  onCreated,
}: CustomArenaCreateModalProps) {
  const [question, setQuestion] = useState('');
  const [step, setStep] = useState<CreateStep>('input');
  const [agentResponse, setAgentResponse] = useState<CustomArenaProposalResponse | null>(null);
  const [proposal, setProposal] = useState<CustomArenaProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depthInput, setDepthInput] = useState(String(defaultMarketDepthPick));
  const [reservePreview, setReservePreview] = useState<CustomArenaReservePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const marketDepthPick = Number(depthInput);
  const validDepth = Number.isSafeInteger(marketDepthPick) && marketDepthPick >= 500;

  const canClose = step !== 'creating';
  const initialOdds = agentResponse?.initial_odds;
  const fallbackUsed = Boolean(initialOdds?.fallback_used || initialOdds?.status === 'fallback');

  useEffect(() => {
    if (step !== 'review' || !agentResponse?.marketId || !validDepth) {
      setReservePreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      customArenaApi.previewReserve(agentResponse.marketId!, marketDepthPick)
        .then((preview) => {
          if (!cancelled) setReservePreview(preview);
        })
        .catch((err) => {
          console.error('Failed to preview custom arena reserve:', err);
          if (!cancelled) setReservePreview(null);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [agentResponse?.marketId, marketDepthPick, step, validDepth]);

  const handleValidate = async (event?: FormEvent) => {
    event?.preventDefault();
    const topic = question.trim();

    if (!topic) {
      setError('Enter a yes/no question.');
      return;
    }

    if (topic.length > 100) {
      setError('Keep the question under 100 characters.');
      return;
    }

    setError(null);
    setStep('loading');

    try {
      const response = await customArenaApi.createProposal(topic, scope, communityId);
      setAgentResponse(response);

      if (response.status === 'created' && response.proposal) {
        if (!response.marketId) {
          setStep('input');
          setError('The AI draft is unavailable. Please try again.');
          return;
        }
        if (!isValidOpeningOdds(response.initial_odds)) {
          setStep('input');
          setError(response.error || 'The AI returned invalid opening probabilities.');
          return;
        }
        setProposal(response.proposal);
        setStep('review');
        return;
      }

      if (response.status === 'needs_clarification') {
        setStep('clarification');
        return;
      }

      setStep('input');
      setError(response.error || 'DePick AI could not create this market.');
    } catch (err) {
      console.error('Failed create custom arena proposal:', err);
      setStep('input');
      setError(getCreateErrorMessage(err, 'Failed to validate question.'));
    }
  };

  const handleCreate = async () => {
    if (!proposal || !agentResponse?.marketId) return;
    if (!validDepth) {
      setError('Choose a whole-PICK market depth of at least 500.');
      return;
    }
    if (!reservePreview?.canPublish) {
      setError('This market needs more reserve than the community has available.');
      return;
    }

    setError(null);
    setStep('creating');

    try {
      const market = await customArenaApi.createMarket(
        communityId,
        scope,
        agentResponse.marketId,
        marketDepthPick,
      );
      if (market.status !== 'OPEN') {
        throw new Error(`Market returned ${market.status}`);
      }
      setStep('success');
      onCreated();
    } catch (err) {
      console.error('Failed create custom arena market:', err);
      setStep('review');
      setError(getCreateErrorMessage(err, 'Failed to publish market. Please try again.'));
    }
  };

  const close = () => {
    if (canClose) onClose();
  };

  const rules = proposal?.resolution_rules ?? [];
  const plan = proposal?.resolution_plan;
  const voidConditions = plan && typeof plan === 'object' && 'void_conditions' in plan
    && Array.isArray(plan.void_conditions)
    ? plan.void_conditions.filter((condition): condition is string => typeof condition === 'string' && condition.trim().length > 0)
    : [];
  const outcomes = proposal?.outcomes?.length ? proposal.outcomes : ['Yes', 'No'];

  return (
    <div className="overlay" onClick={close}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="toggle" />
          <h3>Create Market with DePick AI</h3>
        </div>
        <div className="modal-body custom-arena-modal">
          {step === 'success' ? (
            <div className="custom-arena-success">
              <h4>Market is live</h4>
              <p>It is now open in your community dashboard.</p>
              <button className="confirm-button" onClick={onClose}>
                Done
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleValidate} className="custom-arena-form">
                <label htmlFor="custom-arena-question">What do you want to predict?</label>
                <textarea
                  id="custom-arena-question"
                  maxLength={100}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Example: Will Ronaldo win the FIFA World Cup 2026?"
                  disabled={step === 'loading' || step === 'creating' || step === 'review'}
                />
                <div className="custom-arena-form-footer">
                  <span>{question.length}/100</span>
                  <span>Question must be Yes/No.</span>
                </div>

                {step === 'clarification' && (
                  <div className="custom-arena-panel">
                    {agentResponse?.clarification_question && (
                      <p>{agentResponse.clarification_question}</p>
                    )}
                    {!!agentResponse?.suggestions?.length && (
                      <div className="custom-arena-suggestions">
                        {agentResponse.suggestions.map((suggestion) => (
                          <button
                            type="button"
                            key={suggestion}
                            onClick={() => setQuestion(suggestion.slice(0, 100))}
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {error && <p className="custom-arena-error">{error}</p>}

                {step !== 'review' && step !== 'creating' && (
                  <button
                    type="submit"
                    className="confirm-button"
                    disabled={step === 'loading'}
                  >
                    {step === 'loading' ? 'Generating...' : 'Validate & Generate'}
                  </button>
                )}
              </form>

              {(step === 'review' || step === 'creating') && proposal && (
                <div className="custom-arena-review">
                  <h4>{proposal.question_text || question}</h4>
                  <div className="custom-arena-review-row">
                    <span>Channel</span>
                    <strong>{scope.displayName || scope.scopeExternalId}</strong>
                  </div>
                  <div className="custom-arena-review-row">
                    <span>Outcomes</span>
                    <strong>{outcomes.join(', ')}</strong>
                  </div>
                  <div className="custom-arena-review-row">
                    <span>Deadline</span>
                    <strong>{formatDeadline(proposal.resolution_deadline)}</strong>
                  </div>
                  <div className="custom-arena-review-row">
                    <span>Opening odds</span>
                    <strong>
                      Yes {formatOdds(initialOdds?.p_yes)} · No {formatOdds(initialOdds?.p_no)}
                    </strong>
                  </div>
                  <div className="custom-arena-review-row">
                    <span>AI status</span>
                    <strong>{fallbackUsed ? 'Fallback probabilities' : 'AI estimate'}</strong>
                  </div>
                  {fallbackUsed && (
                    <p className="custom-arena-ai-note">
                      {initialOdds?.fallback_reason
                        || 'A fallback was used because an AI estimate was not available.'}
                    </p>
                  )}
                  <div className="custom-arena-rules">
                    <span>Resolves Yes when</span>
                    <p>{proposal.yes_semantics || 'No Yes settlement terms returned.'}</p>
                  </div>
                  <div className="custom-arena-rules">
                    <span>Resolves No when</span>
                    <p>{proposal.no_semantics || 'No No settlement terms returned.'}</p>
                  </div>
                  <div className="custom-arena-rules">
                    <span>Resolution details</span>
                    {rules.length ? (
                      <ul>
                        {rules.map((rule) => (
                          <li key={rule}>{rule}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No rules returned.</p>
                    )}
                  </div>
                  <div className="custom-arena-rules">
                    <span>Void conditions</span>
                    {voidConditions.length ? (
                      <ul>
                        {voidConditions.map((condition) => <li key={condition}>{condition}</li>)}
                      </ul>
                    ) : (
                      <p>No void conditions returned.</p>
                    )}
                  </div>
                  <div className="custom-arena-form">
                    <label htmlFor="custom-arena-depth">Market depth</label>
                    <input
                      id="custom-arena-depth"
                      type="number"
                      min={500}
                      step={1}
                      value={depthInput}
                      onChange={(event) => setDepthInput(event.target.value)}
                      disabled={step === 'creating'}
                      aria-describedby="custom-arena-depth-help"
                      aria-invalid={!validDepth}
                    />
                    <p id="custom-arena-depth-help">Minimum 500 PICK. Higher depth makes market prices more stable and requires more reserve.</p>
                    <div className="custom-arena-review-row"><span>Required PICK reserve</span><strong>{previewLoading ? 'Calculating…' : reservePreview ? `${Number(reservePreview.requiredReservePick).toLocaleString('en')} PICK` : '—'}</strong></div>
                    <div className="custom-arena-review-row"><span>Available capacity</span><strong>{Number(reservePreview?.availableCapacityPick ?? availableCapacityPick).toLocaleString('en')} PICK</strong></div>
                    <div className="custom-arena-review-row"><span>Remaining after creation</span><strong>{reservePreview?.canPublish ? `${Number(reservePreview.remainingCapacityPick).toLocaleString('en')} PICK` : '—'}</strong></div>
                    {!validDepth && <p role="alert">Choose a whole-PICK market depth of at least 500.</p>}
                    {reservePreview && !reservePreview.canPublish && <p role="alert">This market needs more reserve than the community has available.</p>}
                  </div>
                  <button
                    type="button"
                    className="confirm-button"
                    onClick={handleCreate}
                    disabled={step === 'creating' || previewLoading || !validDepth || !reservePreview?.canPublish}
                  >
                    {step === 'creating' ? 'Publishing market...' : 'Publish Market'}
                  </button>
                </div>
              )}

              <button type="button" className="cancel-button" onClick={close} disabled={!canClose}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function isValidOpeningOdds(value?: CustomArenaProposalResponse['initial_odds']) {
  if (!value || value.p_yes === null || value.p_no === null) return false;
  const yes = value.p_yes;
  const no = value.p_no;
  if (yes === undefined || no === undefined) return false;
  return Number.isFinite(yes) && Number.isFinite(no)
    && yes >= 0.05 && yes <= 0.95
    && no >= 0.05 && no <= 0.95
    && Math.abs(yes + no - 1) < 0.0001;
}

function formatOdds(value?: number | null) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';
}

function formatDeadline(value?: string) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getCreateErrorMessage(err: unknown, fallback: string) {
  const message = (err as {
    response?: { data?: { message?: string | string[] } };
  })?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message || fallback;
}
