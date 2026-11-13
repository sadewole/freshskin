import { useEffect, useState } from 'react';
import { getFragranceProfile, saveFragranceProfile } from '../api/client';
import type { Strength } from '../api/types';
import { useSession } from '../session/SessionProvider';
import { ErrorNote, Loading } from '../ui/Async';

interface Props {
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}

const STRENGTHS: readonly { value: Strength; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'strong', label: 'Strong' },
  { value: 'very_strong', label: 'Very strong' },
];

/**
 * The scent quiz. Selections are component state keyed by family name.
 *
 * A family cannot be both liked and disliked — the server rejects that at the table level
 * (see src/rec/fragrance-profile.ts), so picking one clears it from the other list here
 * rather than letting the user submit a profile that will fail.
 */
export function ScentQuiz({ onSaved, onCancel }: Props) {
  const { meta } = useSession();
  const [liked, setLiked] = useState<readonly string[]>([]);
  const [disliked, setDisliked] = useState<readonly string[]>([]);
  const [strength, setStrength] = useState<Strength>('moderate');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    getFragranceProfile()
      .then(({ data }) => {
        if (cancelled || data === null) return;
        setLiked(data.families_liked);
        setDisliked(data.families_disliked);
        setStrength(data.strength);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(caught);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (family: string, side: 'liked' | 'disliked') => {
    const [mine, setMine, setOther] = side === 'liked'
      ? ([liked, setLiked, setDisliked] as const)
      : ([disliked, setDisliked, setLiked] as const);
    setMine(mine.includes(family) ? mine.filter((item) => item !== family) : [...mine, family]);
    setOther((other) => other.filter((item) => item !== family));
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveFragranceProfile({
        families_liked: liked,
        families_disliked: disliked,
        strength,
        occasions: ['daily'],
      });
      onSaved();
    } catch (caught) {
      setSaveError(caught);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading label="Loading your preferences…" />;

  // If the existing profile could not be read, show the error and do not offer Save: saving
  // an empty form would overwrite a stored profile with nothing (the server upserts).
  if (loadError !== null) {
    return (
      <div className="panel">
        <ErrorNote error={loadError} />
        <button className="ghost" onClick={onCancel}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="panel" aria-labelledby="quiz-title">
      <h2 id="quiz-title">Tell us what you like</h2>
      <p className="muted">
        A short quiz makes perfume suggestions personal. Skip it and we will show what is popular.
      </p>

      <fieldset>
        <legend>Families you like</legend>
        <div className="chips">
          {meta?.families.map((family) => (
            <button
              key={family}
              type="button"
              className="chip"
              aria-pressed={liked.includes(family)}
              onClick={() => toggle(family, 'liked')}
            >
              {family}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Families to avoid</legend>
        <div className="chips">
          {meta?.families.map((family) => (
            <button
              key={family}
              type="button"
              className="chip"
              aria-pressed={disliked.includes(family)}
              onClick={() => toggle(family, 'disliked')}
            >
              {family}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="check">
        Strength
        <select value={strength} onChange={(event) => setStrength(event.target.value as Strength)}>
          {STRENGTHS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {saveError !== null && <ErrorNote error={saveError} />}

      <div className="row">
        <button className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
        <button className="ghost" disabled={saving} onClick={onCancel}>
          Skip
        </button>
      </div>
    </div>
  );
}
