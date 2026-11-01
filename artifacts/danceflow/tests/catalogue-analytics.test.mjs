import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const ANALYTICS_CONSENT_KEY = 'danceflow.catalogue-analytics-enabled.v1';
const VISITOR_KEY = 'danceflow.catalogue-visitor.v1';
const values = new Map();
let visitorRead;
const platform = { OS: 'web' };

const localStorage = {
  getItem(key) {
    if (key === VISITOR_KEY && visitorRead) return visitorRead();
    return values.get(key) ?? null;
  },
  setItem(key, value) {
    values.set(key, value);
  },
  removeItem(key) {
    values.delete(key);
  },
};

mock.module('@react-native-async-storage/async-storage', {
  exports: {
    default: {
      getItem: async (key) => key === VISITOR_KEY && visitorRead
        ? visitorRead()
        : values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async (key) => values.delete(key),
    },
  },
});
mock.module('expo-crypto', {
  exports: { randomUUID: () => 'analytics-test-token' },
});
mock.module('react-native', {
  exports: { Platform: platform },
});
globalThis.window = { localStorage };

let importSequence = 0;
async function loadAnalytics() {
  importSequence += 1;
  return import(`../lib/catalogue-analytics.ts?analytics-test=${importSequence}`);
}

test('disabled analytics never records a new catalogue open', async () => {
  const analytics = await loadAnalytics();
  await analytics.setCatalogueAnalyticsEnabled(false);
  let recorded = false;

  await analytics.recordCatalogueOpenIfEnabled('dance-1', () => { recorded = true; });

  assert.equal(recorded, false);
});

test('declining while a visitor token is pending prevents that open from being recorded', async () => {
  const analytics = await loadAnalytics();
  platform.OS = 'ios';
  let releaseVisitorRead;
  let notifyVisitorReadStarted;
  const visitorReadStarted = new Promise((resolve) => { notifyVisitorReadStarted = resolve; });
  visitorRead = () => new Promise((resolve) => {
    releaseVisitorRead = resolve;
    notifyVisitorReadStarted();
  });
  try {
    await analytics.setCatalogueAnalyticsEnabled(true);
    let recorded = false;
    const recording = analytics.recordCatalogueOpenIfEnabled('dance-2', () => { recorded = true; });

    await visitorReadStarted;
    await analytics.setCatalogueAnalyticsEnabled(false);
    releaseVisitorRead(null);
    await recording;

    assert.equal(recorded, false);
  } finally {
    visitorRead = undefined;
    platform.OS = 'web';
  }
});

test('declined consent survives a fresh module load', async () => {
  const analytics = await loadAnalytics();
  await analytics.setCatalogueAnalyticsEnabled(false);

  const restartedAnalytics = await loadAnalytics();

  assert.equal(values.get(ANALYTICS_CONSENT_KEY), 'false');
  assert.equal(await restartedAnalytics.getCatalogueAnalyticsEnabled(), false);
});
