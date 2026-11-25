import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { stepTransition, stepVariants } from '../ui/motion';
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
type Step = 0 | 1 | 2;

const STEPS: readonly { readonly title: string; readonly hint: string }[] = [
  { title: 'What do you love?', hint: 'Pick the scent families you reach for.' },
  { title: 'What do you avoid?', hint: 'Pick the ones you never want to smell.' },
  { title: 'How strong?', hint: 'Everyday wear, or a scent that enters first?' },
];

export function ScentQuiz({ onSaved, onCancel }: Props) {
  const { meta } = useSession();
  const [step, setStep] = useState<Step>(0);
  const [direction, setDirection] = useState(1);
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

  const current = STEPS[step] ?? STEPS[0];
  const canNext = step < 2;

  return (
    <div className="panel quiz" aria-labelledby="quiz-title">
      <ol className="quiz-steps" aria-label="Quiz progress">
        {STEPS.map((_, index) => (
          <li
            key={index}
            className={index < step ? 'done' : index === step ? 'now' : ''}
            aria-current={index === step ? 'step' : undefined}
            aria-label={`Step ${index + 1} of ${STEPS.length}`}
          />
        ))}
      </ol>
      <h2 id="quiz-title">{current?.title}</h2>
      <p className="muted">{current?.hint}</p>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={step}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          custom={direction}
          transition={stepTransition}
        >
      {step === 0 && (
        <fieldset>
          <legend className="visually-hidden">Families you like</legend>
          <div className="chips">
            {meta?.families.map((family) => (
              <button
                key={family}
                type="button"
                className={`chip like${liked.includes(family) ? ' on' : ''}`}
                aria-pressed={liked.includes(family)}
                onClick={() => toggle(family, 'liked')}
              >
                {family}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {step === 1 && (
        <fieldset>
          <legend className="visually-hidden">Families to avoid</legend>
          <div className="chips">
            {meta?.families.map((family) => (
              <button
                key={family}
                type="button"
                className={`chip avoid${disliked.includes(family) ? ' on' : ''}`}
                aria-pressed={disliked.includes(family)}
                onClick={() => toggle(family, 'disliked')}
              >
                {family}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend className="visually-hidden">Strength</legend>
          <div className="chips">
            {STRENGTHS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`chip${strength === option.value ? ' on' : ''}`}
                aria-pressed={strength === option.value}
                onClick={() => setStrength(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
        </motion.div>
      </AnimatePresence>

      {saveError !== null && <ErrorNote error={saveError} />}

      <div className="row quiz-nav">
        {step > 0 ? (
          <button
            className="ghost small with-icon"
            disabled={saving}
            onClick={() => {
              setDirection(-1);
              setStep((step - 1) as Step);
            }}
          >
            <ArrowLeft size={14} aria-hidden="true" /> Back
          </button>
        ) : (
          <button className="ghost small" disabled={saving} onClick={onCancel}>
            Skip
          </button>
        )}
        {canNext ? (
          <button
            className="primary small with-icon"
            onClick={() => {
              setDirection(1);
              setStep((step + 1) as Step);
            }}
          >
            Continue <ArrowRight size={14} aria-hidden="true" />
          </button>
        ) : (
          <button className="primary small" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Show my scents'}
          </button>
        )}
      </div>
    </div>
  );
}
