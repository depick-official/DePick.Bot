import '../styles/modal.scss';
import '../styles/welcome.scss';

export type WelcomeKind = 'referral' | 'discord';

interface WelcomeModalProps {
  kind: WelcomeKind;
  onClose: () => void;
}

/**
 * Shown once, immediately after a Discord OAuth sign-in created the account.
 *
 * Without it the flow ends by dropping a first-time visitor onto the match list
 * with no acknowledgement: they clicked a friend's invite, approved a consent
 * screen, and landed somewhere that looks like nothing happened. The modal
 * closes that loop — it confirms what was done on their behalf and points at
 * the one action worth taking first.
 *
 * `kind` comes from the backend's `?welcome=` flag, which is only set when the
 * account was newly created, so a returning user never sees this.
 */
export default function WelcomeModal({ kind, onClose }: WelcomeModalProps) {
  const invited = kind === 'referral';

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal welcome-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Welcome to DePick</h2>
        </div>

        <div className="modal-body welcome-body">
          {invited && (
            <p className="welcome-lead">
              You joined on a friend&apos;s invite — their code has been applied
              to your new account.
            </p>
          )}
          {!invited && (
            <p className="welcome-lead">
              Your Discord account is connected and your DePick account is ready.
            </p>
          )}

          <p className="welcome-note">
            You&apos;ve been added to the Discord server, and starting credits
            are already in your balance.
          </p>

          <button type="button" className="confirm-button" onClick={onClose}>
            Make your first prediction
          </button>
        </div>
      </div>
    </div>
  );
}
