import { Link, useRoute, type Route } from './router';
import { useSession } from './session/SessionProvider';
import { ErrorNote, Loading } from './ui/Async';
import { ConsentGate } from './views/ConsentGate';
import { HomeView } from './views/HomeView';
import { ProfileView } from './views/ProfileView';
import { SavedView } from './views/SavedView';
import { ScanView } from './views/ScanView';

const TABS: readonly { readonly route: Route; readonly label: string }[] = [
  { route: 'home', label: 'Home' },
  { route: 'scan', label: 'Scan' },
  { route: 'saved', label: 'Saved' },
  { route: 'profile', label: 'Profile' },
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
        {TABS.map((tab) => (
          <Link
            key={tab.route}
            to={tab.route}
            className="tab"
            aria-current={route === tab.route ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {route === 'home' && <HomeView />}
      {route === 'scan' && <ScanView />}
      {route === 'saved' && <SavedView />}
      {route === 'profile' && <ProfileView />}
    </>
  );
}
