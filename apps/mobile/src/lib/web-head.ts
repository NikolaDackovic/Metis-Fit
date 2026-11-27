import { Platform } from 'react-native';

/**
 * Web only: what phones need for "Add to Home Screen" (the M icon, the name "Metis Fit",
 * full-screen start). The status bar stays opaque ("black"): with "black-translucent" the page
 * would slide under the clock and hide the back arrow. Files live in public/ next to index.html.
 */
export function applyWebHead() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const add = (tag: 'meta' | 'link', attrs: Record<string, string>) => {
    const key = tag === 'meta' ? `meta[name="${attrs.name}"]` : `link[rel="${attrs.rel}"]`;
    if (document.head.querySelector(key)) return;
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  };
  add('link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' });
  add('link', { rel: 'manifest', href: '/manifest.json' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Metis Fit' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' });
  add('meta', { name: 'theme-color', content: '#0A0A0A' });
}
