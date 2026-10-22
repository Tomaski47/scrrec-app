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

export function cameraChoiceLabels(labels: readonly string[], fallback: string): string[] {
  const names = labels.map(label => label.trim() || fallback);
  const totals = new Map<string, number>();
  const seen = new Map<string, number>();
  names.forEach(name => totals.set(name, (totals.get(name) || 0) + 1));
  return names.map(name => {
    const index = (seen.get(name) || 0) + 1;
    seen.set(name, index);
    return totals.get(name)! > 1 ? `${name} ${index}` : name;
  });
}

// Explain recognized native names without guessing from device order or IDs.
// Labels are localized by the browser; leave unrecognized names untouched.
export function cameraDescription(label: string): string | undefined {
  const descriptions: Record<string, string> = {
    'front camera': 'Selfie camera',
    'back camera': 'Standard rear wide lens',
    'back ultra wide camera': 'Rear ultra-wide lens · widest view',
    'back telephoto camera': 'Rear telephoto lens · closer view',
    'back dual camera': 'Combined rear wide + telephoto mode',
    'back dual wide camera': 'Combined rear ultra-wide + wide mode',
    'back triple camera': 'Combined rear ultra-wide + wide + telephoto mode',
  };
  return descriptions[label.trim().toLowerCase()];
}
