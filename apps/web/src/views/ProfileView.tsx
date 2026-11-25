import { useState } from 'react';
import { useDocumentTitle } from '../router';
import { useSession } from '../session/SessionProvider';
import { useAsync } from '../data/useAsync';
import { getFragranceProfile } from '../api/client';
import { ErrorNote, Loading } from '../ui/Async';

/** Profile: session identity, the consent ledger, and what the scent quiz holds. */
export function ProfileView() {
  useDocumentTitle('Profile');
  const { me, grant, signOut, reload } = useSession();
  const quiz = useAsync(getFragranceProfile, []);
  const [error, setError] = useState<unknown>(null);

  if (me === null) return null;

  const consentEntries = Object.entries(me.consents) as [keyof typeof me.consents, boolean][];

  return (
    <section aria-labelledby="profile-title">
      <div className="hero">
        <p className="kicker">Your space</p>
        <h2 id="profile-title">Profile</h2>
        <p className="muted small">Anonymous session · {me.user_id.slice(0, 8)}…</p>
      </div>

      <div className="card">
        <h3>Scent quiz</h3>
        {quiz.loading && <Loading />}
        {quiz.error !== null && <ErrorNote error={quiz.error} />}
        {quiz.data?.data == null ? (
          <p className="muted">{me.has_fragrance_profile ? 'Saved.' : 'Not taken yet.'}</p>
        ) : (
          <dl className="quiz-summary">
            <div>
              <dt>Loves</dt>
              <dd>{quiz.data.data.families_liked.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt>Avoids</dt>
              <dd>{quiz.data.data.families_disliked.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt>Strength</dt>
              <dd className="capitalize">{quiz.data.data.strength.replace(/_/g, ' ')}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="card">
        <h3>Permissions</h3>
        <p className="muted small card-sub">
          You choose what we may process, and you can change this at any time.
        </p>
        {consentEntries.map(([kind, granted]) => (
          <label className="consent-row" key={kind}>
            <span className="consent-label">{kind.replace(/_/g, ' ')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={granted}
              aria-label={`${kind.replace(/_/g, ' ')} consent`}
              className={`switch${granted ? ' on' : ''}`}
              onClick={() => {
                setError(null);
                // Session state updates on success, which re-renders the switch. On failure
                // it snaps back to the ledger value; showing the error is the feedback.
                void grant(kind, !granted).catch(setError);
              }}
            >
              <span className="switch-knob" aria-hidden="true" />
            </button>
          </label>
        ))}
      </div>

      {error !== null && <ErrorNote error={error} />}

      <button
        className="secondary"
        onClick={() => {
          setError(null);
          void signOut().catch((caught: unknown) => {
            setError(caught);
            void reload();
          });
        }}
      >
        End session
      </button>
    </section>
  );
}
