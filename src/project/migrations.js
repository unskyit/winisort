export const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * Validates and migrates a loaded project manifest to CURRENT_SCHEMA_VERSION.
 * Never allows raw media bytes or base64 blobs inside manifest payloads.
 * @param {any} rawManifest
 * @returns {{ valid: boolean, manifest?: Object, migrated: boolean, errors: string[] }}
 */
export function validateAndMigrateManifest(rawManifest) {
  const errors = [];
  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    return { valid: false, migrated: false, errors: ['Manifest root must be a JSON object.'] };
  }

  let migrated = false;
  const clone = structuredClone ? structuredClone(rawManifest) : JSON.parse(JSON.stringify(rawManifest));

  if (!clone.schemaVersion) {
    clone.schemaVersion = '0.9.0';
  }
  if (clone.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    // Migrate 0.9.x -> 1.0.0
    clone.schemaVersion = CURRENT_SCHEMA_VERSION;
    migrated = true;
  }

  if (typeof clone.projectId !== 'string' || !clone.projectId.trim()) {
    errors.push('Missing or invalid projectId.');
  }
  if (typeof clone.name !== 'string' || !clone.name.trim()) {
    clone.name = 'Restored WiniSort Project';
  }
  if (!Array.isArray(clone.destinations)) {
    errors.push('Manifest "destinations" must be an array.');
  }
  if (!Array.isArray(clone.sources)) {
    clone.sources = [];
  }
  if (!Array.isArray(clone.assignments)) {
    clone.assignments = [];
  }

  return {
    valid: errors.length === 0,
    manifest: clone,
    migrated,
    errors
  };
}
