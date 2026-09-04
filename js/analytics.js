// ============================================================
// balco.nyc — analytics (PostHog).
//
// Live. Events go to PostHog project 593517 on US cloud.
//
// If PROJECT_KEY is ever emptied or malformed, this file does nothing at
// all: no script is fetched, no cookie is set, no request leaves the
// browser. That guard is deliberate — a half-configured key looks
// installed and collects nothing, and you find out weeks later.
//
// PRIVACY, and why the settings below are what they are. People type
// their home address into this site. PostHog's session replay would
// record that keystroke by keystroke, and its autocapture would send the
// values of form fields. Both are turned down here rather than left on
// their defaults:
//
//   - every input is masked in replay, and the address field is excluded
//     from capture entirely;
//   - Do Not Track is honoured, which PostHog will otherwise ignore;
//   - person profiles are only created for identified users, and nothing
//     here ever identifies anyone, so in practice none are created.
//
// The single custom event carries the rounded annual kWh and nothing
// else. No address, no coordinates.
// ============================================================
(function () {
  // Type __balcoAnalytics in the browser console and one word tells you where
  // this got to. Analytics fails silently by nature — no error, no missing
  // pixel, just no data three weeks later — so it reports on itself:
  //
  //   'off'       no key, or the browser asked not to be tracked
  //   'loading'   the request went out; no answer yet
  //   'blocked'   a content blocker stopped it. PostHog's domains are on most
  //               lists and Brave blocks them by default
  //   'ready'     running
  //   undefined   you are looking at a cached copy of an older build
  function status(v) { window.__balcoAnalytics = v; }
  status('off');

  // Project 593517, US cloud. This token is public by design: it ships in
  // the JavaScript every visitor downloads. It identifies where events go,
  // it does not grant access to anything.
  var PROJECT_KEY = 'phc_z67vrAYf4GQLGK3mqCFL7zPY6AW4n6WhFCk2Z9LJuN2L';
  var API_HOST    = 'https://us.i.posthog.com';

  if (!/^phc_[A-Za-z0-9]+$/.test(PROJECT_KEY)) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  // Loaded plainly rather than via PostHog's minified stub snippet. The stub
  // exists to queue calls made before the library arrives; nothing here
  // captures until a visitor acts, long after load, so the readable version
  // costs nothing and can actually be audited.
  status('loading');

  var s = document.createElement('script');
  s.async = true;
  s.src = API_HOST.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';

  s.onerror = function () {
    status('blocked');
  };

  s.onload = function () {
    if (!window.posthog || !window.posthog.init) { status('blocked'); return; }

    window.posthog.init(PROJECT_KEY, {
      api_host: API_HOST,
      person_profiles: 'identified_only',
      respect_dnt: true,

      // These two belong at the top level. They are PostHogConfig keys, while
      // AutocaptureConfig holds only allowlists and ignorelists — so nesting
      // them under `autocapture` drops them silently and both fall back to
      // false. Autocapture itself stays on; true is its default.
      mask_all_element_attributes: true,   // which element was used, not its attributes
      mask_all_text: false,                // button labels stay readable; they carry nothing

      session_recording: {
        maskAllInputs: true,                  // never record a typed value
        maskTextSelector: '[data-private]'    // and mask anything marked private
      }
    });

    // The one funnel question worth answering: of the people who land here,
    // how many actually get an estimate?
    window.balcoTrack = function (name, params) {
      if (window.posthog && window.posthog.capture) {
        window.posthog.capture(name, params || {});
      }
    };

    status('ready');
  };

  document.head.appendChild(s);

  // Defined immediately so callers never have to test for it. Until the
  // library loads this is a no-op rather than an error.
  window.balcoTrack = window.balcoTrack || function () {};
})();
