// ============================================================
// balco.nyc — analytics.
//
// Set MEASUREMENT_ID to the property's G-XXXXXXXXXX and analytics starts
// reporting. Leave it empty and this file does nothing at all: no script
// is fetched, no cookie is set, no request leaves the browser. That is
// deliberate — a half-configured tag that fires against the wrong property
// is worse than no analytics, and a placeholder ID silently collects
// nothing while looking installed.
//
// Nothing here identifies a visitor. No address anyone types into the
// calculator is ever sent: the only events are page views and whether the
// calculator was used, which is what the questions worth asking need
// (how many people arrive, from where, and how many get to a result).
// ============================================================
(function () {
  var MEASUREMENT_ID = '';   // <- paste the GA4 ID here

  if (!/^G-[A-Z0-9]+$/.test(MEASUREMENT_ID)) return;

  // Respect an explicit Do Not Track signal. GA would otherwise ignore it.
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, {
    anonymize_ip: true,
    allow_google_signals: false,      // no cross-device ad personalisation
    allow_ad_personalization_signals: false
  });

  // One custom event, because the only interesting funnel on this site is
  // "arrived" -> "actually got an estimate". Fired from index.html when a
  // result renders. The address is never included.
  window.balcoTrack = function (name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  };
})();
