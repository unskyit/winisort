import { computeStreamingDigest } from '../filesystem/verification.js';

self.onmessage = async (event) => {
  const { id, blob } = event.data || {};
  try {
    const digest = await computeStreamingDigest(blob);
    self.postMessage({ id, ok: true, digest });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message });
  }
};
