import { evaluateFileEligibility } from '../filesystem/file-classifier.js';

self.onmessage = (event) => {
  const { id, files, filters } = event.data || {};
  const results = [];
  for (const f of files || []) {
    results.push({
      name: f.name,
      ...evaluateFileEligibility(f, filters)
    });
  }
  self.postMessage({ id, results });
};
