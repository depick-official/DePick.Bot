import { FormEvent, useState } from 'react';
import { customArenaApi } from '../services/api';
import {
  CustomArenaProposal,
  CustomArenaProposalResponse,
  CustomArenaScope,
} from '../types/CustomArena';
import '../styles/modal.scss';

type CreateStep = 'input' | 'loading' | 'clarification' | 'review' | 'creating' | 'success';

interface CustomArenaCreateModalProps {
  scope: CustomArenaScope;
  onClose: () => void;
  onCreated: () => void;
}

export default function CustomArenaCreateModal({
  scope,
  onClose,
  onCreated,
}: CustomArenaCreateModalProps) {
  const [question, setQuestion] = useState('');
  const [step, setStep] = useState<CreateStep>('input');
  const [agentResponse, setAgentResponse] = useState<CustomArenaProposalResponse | null>(null);
  const [proposal, setProposal] = useState<CustomArenaProposal | null>(null);
  const [liquidityPICK, setLiquidityPICK] = useState('500');
  const [error, setError] = useState<string | null>(null);

  const canClose = step !== 'creating';

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
      const response = await customArenaApi.createProposal(topic, scope);
      setAgentResponse(response);

      if (response.status === 'created' && response.proposal) {
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
      setError('Failed to validate question.');
    }
  };

  const handleCreate = async () => {
    if (!proposal) return;
    const liquidity = Number(liquidityPICK);
    if (!Number.isFinite(liquidity) || liquidity < 500) {
      setError('Minimum creator liquidity is 500 PICK.');
      return;
    }

    setError(null);
    setStep('creating');

    try {
      const market = await customArenaApi.createMarket(scope, proposal, liquidity);
      if (market.status !== 'OPEN') {
        throw new Error(`Market returned ${market.status}`);
      }
      setStep('success');
      onCreated();
    } catch (err) {
      console.error('Failed create custom arena market:', err);
      await onCreated();
      setStep('review');
      setError(getCreateErrorMessage(err));
    }
  };

  const close = () => {
    if (canClose) onClose();
  };

  const rules = proposal?.resolution_rules ?? [];
  const outcomes = proposal?.outcomes?.length ? proposal.outcomes : ['Yes', 'No', 'Unresolvable'];

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
            <p>It is now open in the Group and Created tabs.</p>
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
                  disabled={step === 'loading' || step === 'creating'}
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
                    <span>Outcomes</span>
                    <strong>{outcomes.join(', ')}</strong>
                  </div>
      <div className="custom-arena-review-row">
        <span>Deadline</span>
        <strong>{formatDeadline(proposal.resolution_deadline)}</strong>
      </div>
      <div className="custom-arena-review-row custom-arena-liquidity-row">
        <label htmlFor="custom-arena-liquidity">Creator liquidity</label>
        <div className="custom-arena-liquidity-input">
          <input
            id="custom-arena-liquidity"
            type="number"
            min={500}
            step={1}
            value={liquidityPICK}
            onChange={(event) => setLiquidityPICK(event.target.value)}
            disabled={step === 'creating'}
          />
          <span>PICK</span>
        </div>
      </div>
      <p className="custom-arena-liquidity-note">
        500 PICK minimum. You can earn leftover liquidity after settlement,
        but profit is not guaranteed. Market fees go to DePick.
      </p>
      <div className="custom-arena-rules">
        <span>Resolution rules</span>
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
            <button
        type="button"
        className="confirm-button"
        onClick={handleCreate}
        disabled={step === 'creating' || Number(liquidityPICK) < 500}
      >
              {step === 'creating' ? 'Deploying market...' : 'Agree & Create'}
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

function getCreateErrorMessage(err: unknown) {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || 'Failed to deploy market. Please try again.';
}
