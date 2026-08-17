declare global {
  interface Window {
    google?: any;
    __dalltyMapsReady?: () => void;
  }
}

let loader: Promise<void> | null = null;

/** Loads the Maps JS API once, asynchronously, with Dallty's own browser key. */
export function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (loader) return loader;

  const key = import.meta.env["VITE_GOOGLE_MAPS_BROWSER_KEY"];
  const channel = import.meta.env["VITE_GOOGLE_MAPS_TRACKING_ID"];
  if (!key) return Promise.reject(new Error("Google Maps is not configured"));

  loader = new Promise<void>((resolve, reject) => {
    window.__dalltyMapsReady = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&callback=__dalltyMapsReady${
      channel ? `&channel=${channel}` : ""
    }`;
    script.async = true;
    script.onerror = () => reject(new Error("Could not load Google Maps"));
    document.head.appendChild(script);
  });
  return loader;
}

export {};
