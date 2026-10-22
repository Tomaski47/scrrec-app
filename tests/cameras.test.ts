import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCameraIds, requiresSingleCamera, cameraChoiceLabels } from '../src/recorder/cameras.ts';

test('iPhone and iPad replace an existing camera even when real device IDs are exposed', () => {
  for (const browser of [
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', maxTouchPoints: 5 },
    { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', maxTouchPoints: 5 },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 },
  ]) {
    assert.equal(requiresSingleCamera(['front-device-id', 'rear-device-id'], browser), true);
    assert.deepEqual(nextCameraIds(['front-device-id'], 'rear-device-id', true, browser), ['rear-device-id']);
    assert.deepEqual(nextCameraIds(['rear-device-id'], 'rear-device-id', false, browser), []);
  }
});

test('native physical and combined lens names stay distinct; only identical labels are numbered', () => {
  assert.deepEqual(cameraChoiceLabels([
    'Back Camera', 'Back Ultra Wide Camera', 'Back Telephoto Camera',
    'Back Dual Camera', 'Back Dual Wide Camera', 'Back Triple Camera',
  ], 'Rear Camera'), [
    'Back Camera', 'Back Ultra Wide Camera', 'Back Telephoto Camera',
    'Back Dual Camera', 'Back Dual Wide Camera', 'Back Triple Camera',
  ]);
  assert.deepEqual(cameraChoiceLabels(['Rückkamera', 'Back Camera', 'Rückkamera', ''], 'Rear Camera'), [
    'Rückkamera 1', 'Back Camera', 'Rückkamera 2', 'Rear Camera',
  ]);
});

test('desktop keeps multiple real cameras; fallback camera choices remain exclusive', () => {
  const browser = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 };
  assert.deepEqual(nextCameraIds(['camera-one'], 'camera-two', true, browser), ['camera-one', 'camera-two']);
  assert.deepEqual(nextCameraIds(['camera-one'], 'camera-one', true, browser), ['camera-one']);
  assert.deepEqual(nextCameraIds(['camera-one'], '__front_camera__', true, browser), ['__front_camera__']);
});
