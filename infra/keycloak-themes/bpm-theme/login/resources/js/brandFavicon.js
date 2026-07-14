// Resolved relative to this script's own location (resources/js/) so it works
// regardless of the realm/theme version segment Keycloak inserts into
// url.resourcesPath — a hardcoded root path can't reach the theme's own
// resources/img/ directory since Keycloak serves its own origin, not the
// frontend app's.
const logoUrl = new URL('../img/bpm-logo-official.png', import.meta.url).href;

const favicon = document.querySelector('link[rel="icon"]');

if (favicon) {
  favicon.href = logoUrl;
  favicon.type = 'image/png';
}
