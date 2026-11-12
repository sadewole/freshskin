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
      <h2 id="profile-title">Profile</h2>
      <p className="muted small">Session {me.user_id}</p>

      <h3>Scent quiz</h3>
      {quiz.loading && <Loading />}
      {quiz.error !== null && <ErrorNote error={quiz.error} />}
      {quiz.data?.data == null ? (
        <p className="muted">{me.has_fragrance_profile ? 'Saved.' : 'Not taken yet.'}</p>
      ) : (
        <dl>
          <dt className="muted small">Likes</dt>
          <dd>{quiz.data.data.families_liked.join(', ') || '—'}</dd>
          <dt className="muted small">Avoids</dt>
          <dd>{quiz.data.data.families_disliked.join(', ') || '—'}</dd>
          <dt className="muted small">Strength</dt>
          <dd>{quiz.data.data.strength.replace(/_/g, ' ')}</dd>
        </dl>
      )}

      <h3>Permissions</h3>
      {consentEntries.map(([kind, granted]) => (
        <label className="check" key={kind}>
          <input
            type="checkbox"
            checked={granted}
            onChange={(event) => {
              setError(null);
              // Session state updates on success, which re-renders the checkbox. On failure
              // the box snaps back to the ledger value; showing the error is the feedback.
              void grant(kind, event.target.checked).catch(setError);
            }}
          />
          <span>{kind.replace(/_/g, ' ')}</span>
        </label>
      ))}

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
