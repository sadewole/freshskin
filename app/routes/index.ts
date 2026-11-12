import { authRoutes } from './auth.js';
import { catalogRoutes } from './catalog.js';
import { consentRoutes } from './consent.js';
import { fragranceProfileRoutes } from './fragrance-profile.js';
import { recommendationRoutes } from './recommendations.js';
import { savedRoutes } from './saved.js';
import { scanRoutes } from './scans.js';
import { skinRoutes } from './skin.js';
import type { Route } from './types.js';

export const routes: readonly Route[] = [
  ...authRoutes,
  ...consentRoutes,
  ...fragranceProfileRoutes,
  ...recommendationRoutes,
  ...savedRoutes,
  ...scanRoutes,
  ...skinRoutes,
  ...catalogRoutes,
];
