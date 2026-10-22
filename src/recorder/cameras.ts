export const genericFrontCameraId = '__front_camera__';
export const genericRearCameraId = '__rear_camera__';
export const genericCameraId = '__camera__';

export const isGenericCameraId = (id: string) => (
  [genericFrontCameraId, genericRearCameraId, genericCameraId].includes(id)
);

type Browser = Pick<Navigator, 'userAgent' | 'maxTouchPoints'>;

export const isAppleMobile = (browser: Browser) => (
  /iPhone|iPad|iPod/i.test(browser.userAgent) ||
  (/Macintosh/i.test(browser.userAgent) && browser.maxTouchPoints > 1)
);

// A second iOS camera capture can mute the first even when both device IDs
// are exposed. iPad desktop browsing also uses a Macintosh user agent.
export const requiresSingleCamera = (ids: string[], browser: Browser) => (
  isAppleMobile(browser) || ids.some(isGenericCameraId)
);

export function nextCameraIds(current: string[], next: string, checked: boolean, browser: Browser) {
  if (!checked) return current.filter(id => id !== next);
  if (requiresSingleCamera([...current, next], browser)) return [next];
  return current.includes(next) ? current : [...current, next];
}
