// jsdom ships no CSS media query engine, so `window.matchMedia` is absent
// entirely - it is one of the APIs jsdom documents as unimplemented, not a gap
// in any component here. Every real browser has had it for a decade, so a
// component that calls it is behaving correctly and would crash only in this
// environment. `sonner`'s `<Toaster>` calls it on mount to follow
// `prefers-color-scheme`, and `<Toaster>` ships in the real app
// (`apps/web/src/components/providers.tsx`), so without this shim the one
// component we most want to prove mounts is the one we could not render.
//
// This is a environment shim, not a test double: it makes jsdom look more like
// a browser rather than making a component look like it works.

// Reports "no match" for every query, which is the deterministic choice - these
// tests assert that components mount and what they put in the tree, never how
// they react to a media query. A future test that needs a *matching* query
// should override this for its own case rather than widen the default here.
function stubMediaQueryList(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    // Deprecated, but `sonner` falls back to them for older Safari, and it
    // reaches that branch through a `try`/`catch` rather than a feature test.
    addListener: () => {},
    removeListener: () => {},
  };
}

window.matchMedia = stubMediaQueryList;
