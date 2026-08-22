// Shared by the landing page and the instrument at /live/.
const MEASUREMENT_ID = 'G-CKGF1JW4EC';

if (/^G-[A-Z0-9]+$/i.test(MEASUREMENT_ID)) {
  globalThis.dataLayer = globalThis.dataLayer || [];
  globalThis.gtag = function gtag() {
    globalThis.dataLayer.push(arguments);
  };

  globalThis.gtag('js', new Date());
  globalThis.gtag('config', MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.append(tag);
}
