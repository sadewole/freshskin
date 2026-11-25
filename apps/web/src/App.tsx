import { Heart, Home, ScanLine, User } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useRoute, type Route } from './router';
import { viewEnter } from './ui/motion';
import { useSession } from './session/SessionProvider';
import { ErrorNote, Loading } from './ui/Async';
import { ConsentGate } from './views/ConsentGate';
import { HomeView } from './views/HomeView';
import { ProfileView } from './views/ProfileView';
import { SavedView } from './views/SavedView';
import { ScanView } from './views/ScanView';

const TABS: readonly { readonly route: Route; readonly label: string; readonly Icon: typeof Home }[] = [
  { route: 'home', label: 'Home', Icon: Home },
  { route: 'scan', label: 'Scan', Icon: ScanLine },
  { route: 'saved', label: 'Saved', Icon: Heart },
  { route: 'profile', label: 'Profile', Icon: User },
];

/**
 * The shell. It decides one thing: whether to show the consent gate or the app, and which
 * view the route selects. Every view owns its own data and its own loading state.
 */
export function App() {
  const { status, error, requiredConsentsGranted, reload } = useSession();
  const route = useRoute();

  if (status === 'loading') return <Loading label="Starting FreshSkin…" />;
  if (status === 'failed') {
    return (
      <section className="panel">
        <ErrorNote error={error} />
        <button className="primary" onClick={() => void reload()}>
          Try again
        </button>
      </section>
    );
  }

  // Derived from session state, never latched. A latch here meant a signed-out user — a new
  // anonymous session with no consents — walked straight past the gate, and revoking image
  // consent in Profile left the app usable until the next reload.
  if (!requiredConsentsGranted) return <ConsentGate />;

  return (
    <>
      <nav className="tabs" aria-label="Sections">
        {TABS.map(({ route: tabRoute, label, Icon }) => (
          <Link
            key={tabRoute}
            to={tabRoute}
            className="tab"
            aria-current={route === tabRoute ? 'page' : undefined}
          >
            <Icon className="tab-icon" size={20} aria-hidden="true" />
            <span className="tab-label">{label}</span>
          </Link>
        ))}
      </nav>

      <AnimatePresence mode="wait" initial={false}>
      {route === 'home' && (
        <motion.div key="home" {...viewEnter}>
          <HomeView />
        </motion.div>
      )}
      {route === 'scan' && (
        <motion.div key="scan" {...viewEnter}>
          <ScanView />
        </motion.div>
      )}
      {route === 'saved' && (
        <motion.div key="saved" {...viewEnter}>
          <SavedView />
        </motion.div>
      )}
      {route === 'profile' && (
        <motion.div key="profile" {...viewEnter}>
          <ProfileView />
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
