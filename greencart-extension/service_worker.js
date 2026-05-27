// Manifest V3 service worker (kept minimal on purpose).
// The extension logic runs in the popup and content script.

self.addEventListener("install", () => {
  // Nothing to preload; this is here to show “MV3 service worker” in the codebase.
  // console.log("GreenCart installed");
});

self.addEventListener("activate", () => {
  // console.log("GreenCart activated");
});

