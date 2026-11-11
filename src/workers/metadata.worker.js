self.onmessage = (event) => {
  const { id, fileInfo } = event.data || {};
  const ext = (fileInfo?.name || '').split('.').pop()?.toLowerCase() || '';
  self.postMessage({
    id,
    metadata: {
      name: fileInfo?.name || '',
      extension: ext,
      size: fileInfo?.size || 0,
      lastModifiedIso: fileInfo?.lastModified ? new Date(fileInfo.lastModified).toISOString() : null
    }
  });
};
