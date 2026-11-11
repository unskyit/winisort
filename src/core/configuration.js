export const DESTINATION_PALETTE = Object.freeze([
  { id: 'blue', name: 'Calm Blue', hex: '#5286DB' },
  { id: 'emerald', name: 'Forest Emerald', hex: '#38A169' },
  { id: 'amber', name: 'Warm Amber', hex: '#D69E2E' },
  { id: 'purple', name: 'Royal Purple', hex: '#805AD5' },
  { id: 'teal', name: 'Ocean Teal', hex: '#319795' },
  { id: 'orange', name: 'Sunset Orange', hex: '#DD6B20' },
  { id: 'indigo', name: 'Soft Indigo', hex: '#6875F5' },
  { id: 'rose', name: 'Crimson Rose', hex: '#E53E3E' },
  { id: 'cyan', name: 'Glacier Cyan', hex: '#00A3C4' },
  { id: 'pink', name: 'Orchid Pink', hex: '#D53F8C' }
]);

export const MEDIA_CATEGORIES = Object.freeze({
  images: {
    id: 'images',
    label: 'Images',
    emoji: '🖼️',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'svg']
  },
  videos: {
    id: 'videos',
    label: 'Videos',
    emoji: '🎬',
    extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi', 'mpeg', 'mpg', '3gp']
  },
  audio: {
    id: 'audio',
    label: 'Audio',
    emoji: '🎵',
    extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'aiff', 'wma']
  },
  pdf: {
    id: 'pdf',
    label: 'PDF',
    emoji: '📕',
    extensions: ['pdf']
  },
  documents: {
    id: 'documents',
    label: 'Documents',
    emoji: '📄',
    extensions: ['doc', 'docx', 'txt', 'rtf', 'odt', 'md', 'markdown']
  },
  spreadsheets: {
    id: 'spreadsheets',
    label: 'Spreadsheets',
    emoji: '📊',
    extensions: ['xls', 'xlsx', 'csv', 'ods', 'tsv']
  },
  presentations: {
    id: 'presentations',
    label: 'Presentations',
    emoji: '📽️',
    extensions: ['ppt', 'pptx', 'odp']
  },
  archives: {
    id: 'archives',
    label: 'Archives',
    emoji: '🗜️',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
  },
  ebooks: {
    id: 'ebooks',
    label: 'E-books',
    emoji: '📚',
    extensions: ['epub', 'mobi', 'azw3']
  },
  other: {
    id: 'other',
    label: 'Other files',
    emoji: '📦',
    extensions: []
  }
});

export const STARTER_TEMPLATES = Object.freeze({
  festivals: {
    id: 'festivals',
    name: 'Festivals & Celebrations',
    emoji: '🪔',
    destinations: [
      { name: 'Diwali', emoji: '🪔', color: '#D69E2E', bank: 'top', pinned: true, shortcut: '1' },
      { name: 'Holi', emoji: '🎨', color: '#D53F8C', bank: 'top', pinned: true, shortcut: '2' },
      { name: 'Weddings', emoji: '💍', color: '#E53E3E', bank: 'left', pinned: true, shortcut: '3' },
      { name: 'Birthdays', emoji: '🎂', color: '#805AD5', bank: 'right', pinned: false, shortcut: '4' }
    ]
  },
  family: {
    id: 'family',
    name: 'Family Memories',
    emoji: '👨‍👩‍👧‍👦',
    destinations: [
      { name: 'Vacations', emoji: '🏖️', color: '#00A3C4', bank: 'top', pinned: true, shortcut: '1' },
      { name: 'Kids & School', emoji: '🎓', color: '#5286DB', bank: 'left', pinned: true, shortcut: '2' },
      { name: 'Home & Pets', emoji: '🐾', color: '#38A169', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Favorites Print', emoji: '⭐', color: '#D69E2E', bank: 'bottom', pinned: false, shortcut: '4' }
    ]
  },
  school: {
    id: 'school',
    name: 'School & College',
    emoji: '🎓',
    destinations: [
      { name: 'Lecture Notes', emoji: '📝', color: '#5286DB', bank: 'left', pinned: true, shortcut: '1' },
      { name: 'Assignments', emoji: '📚', color: '#805AD5', bank: 'top', pinned: true, shortcut: '2' },
      { name: 'Research Papers', emoji: '📕', color: '#E53E3E', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Lab Data', emoji: '🧪', color: '#38A169', bank: 'bottom', pinned: false, shortcut: '4' }
    ]
  },
  work: {
    id: 'work',
    name: 'Professional Documents',
    emoji: '💼',
    destinations: [
      { name: 'Work Projects', emoji: '💼', color: '#5286DB', bank: 'left', pinned: true, shortcut: '1' },
      { name: 'Invoices & Receipts', emoji: '🧾', color: '#38A169', bank: 'top', pinned: true, shortcut: '2' },
      { name: 'Contracts & Legal', emoji: '⚖️', color: '#6875F5', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Presentations', emoji: '📊', color: '#DD6B20', bank: 'bottom', pinned: false, shortcut: '4' }
    ]
  },
  photography: {
    id: 'photography',
    name: 'Photography Culling',
    emoji: '📷',
    destinations: [
      { name: '5-Star Selects', emoji: '🌟', color: '#D69E2E', bank: 'top', pinned: true, shortcut: '1' },
      { name: 'Portraits', emoji: '🧑', color: '#5286DB', bank: 'left', pinned: true, shortcut: '2' },
      { name: 'Landscapes', emoji: '🏔️', color: '#38A169', bank: 'right', pinned: true, shortcut: '3' },
      { name: 'Needs Editing', emoji: '🎨', color: '#805AD5', bank: 'bottom', pinned: false, shortcut: '4' }
    ]
  }
});

export function createDefaultPreferences() {
  return {
    theme: 'system', // 'light' | 'dark' | 'system'
    accentColor: '#5286DB',
    density: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
    motionLevel: 'full', // 'full' | 'reduced'
    transparencyLevel: 'normal', // 'normal' | 'reduced'
    unitSystem: 'SI', // 'SI' (MB/GB) | 'IEC' (MiB/GiB)
    operationMode: 'copy', // 'copy' | 'move' (move requires explicit authorization)
    collisionPolicy: 'keep-both', // 'keep-both' | 'auto-rename' | 'skip' | 'ask' | 'replace'
    verifyCopyIntegrity: true,
    allowSourceModification: false,
    dryRunMode: false,
    poolDisplayMode: 'show', // 'show' | 'hide' | 'auto-hide' | 'collapsed'
    defaultBankPlacement: 'left',
    maxVisibleCardsPerBank: 6,
    compactCards: false,
    autoCheckpointInterval: 10,
    compressionDefaults: {
      mode: 'quality', // 'lossless' | 'quality' | 'resize'
      format: 'image/webp',
      quality: 0.84,
      maxDimension: 2560,
      preserveOriginalsInSubfolder: true
    }
  };
}

export function createDefaultFilters() {
  const enabledCategories = {
    images: true,
    videos: true,
    audio: true,
    pdf: true,
    documents: true,
    spreadsheets: true,
    presentations: true,
    archives: false,
    ebooks: false,
    other: false
  };
  const enabledExtensions = new Set();
  for (const [catId, cat] of Object.entries(MEDIA_CATEGORIES)) {
    if (enabledCategories[catId]) {
      for (const ext of cat.extensions) enabledExtensions.add(ext);
    }
  }
  return {
    categories: enabledCategories,
    extensions: Array.from(enabledExtensions),
    customExtensions: [],
    minSizeBytes: 0,
    maxSizeBytes: 0, // 0 = no upper limit
    dateFrom: '',
    dateTo: '',
    includePattern: '',
    excludePattern: '',
    includeNestedFolders: true,
    includeHiddenFiles: false
  };
}
