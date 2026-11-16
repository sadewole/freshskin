import type { APIRoute } from 'astro';

// Static marketing site: one page today, plus the ingredients stub route.
// Keep this list in sync with src/pages.
const routes = ['/', '/ingredients/glycerin/', '/ingredients/shea-butter/'];

export const GET: APIRoute = () =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      routes
        .map(
          (path) =>
            `  <url><loc>https://freshskin.com${path}</loc><changefreq>monthly</changefreq></url>`,
        )
        .join('\n') +
      `\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
