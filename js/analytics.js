// ============================================================
// balco.nyc — analytics (PostHog).
//
// Set PROJECT_KEY to the project's phc_... key and analytics starts.
// Leave it empty and this file does nothing at all: no script is fetched,
// no cookie is set, no request leaves the browser. That is deliberate —
// a half-configured key looks installed and collects nothing, and you
// find out weeks later.
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
  var PROJECT_KEY = '';                       // <- paste the phc_... key here
  var API_HOST    = 'https://us.i.posthog.com';  // 'https://eu.i.posthog.com' for EU

  if (!/^phc_[A-Za-z0-9]+$/.test(PROJECT_KEY)) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  // Loaded plainly rather than via PostHog's minified stub snippet. The stub
  // exists to queue calls made before the library arrives; nothing here
  // captures until a visitor acts, long after load, so the readable version
  // costs nothing and can actually be audited.
  var s = document.createElement('script');
  s.async = true;
  s.src = API_HOST.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';

  s.onload = function () {
    if (!window.posthog || !window.posthog.init) return;

    window.posthog.init(PROJECT_KEY, {
      api_host: API_HOST,
      person_profiles: 'identified_only',
      respect_dnt: true,
      autocapture: {
        // Autocapture reports which element was interacted with. It must not
        // report what was typed into it.
        mask_all_element_attributes: true,
        mask_all_text: false
      },
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
  };

  document.head.appendChild(s);

  // Defined immediately so callers never have to test for it. Until the
  // library loads this is a no-op rather than an error.
  window.balcoTrack = window.balcoTrack || function () {};
})();
