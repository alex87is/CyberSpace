/**
 * mobile.js — shared "is this a phone/tablet" check, used by both game
 * entry points to gate play behind a desktop-only message. Neither game
 * has a touch control scheme (both need real keys: arrows/WASD, Space,
 * and 3D also needs Shift), so there's nothing useful to offer on a
 * touchscreen-only device.
 */

function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || '';
  if (/Android|iPhone|iPod|Windows Phone|BlackBerry|IEMobile|Mobi/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  // iPadOS reports as "Macintosh" but exposes multi-touch; real Macs don't
  if (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || '')) return true;
  return false;
}
