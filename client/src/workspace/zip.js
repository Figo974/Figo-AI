const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function normalizeWorkspacePath(value) {
  const path = String(value || '/').replace(/\\/g, '/');
  const parts = path.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) throw new Error('Invalid workspace folder path.');
  return `/${parts.join('/')}`;
}

function shouldSkip(name, isDirectory) {
  if (isDirectory) return new Set(['node_modules', '.git', '.next', '.cache', '__pycache__']).has(name);
  if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) return true;
  if (/^(id_rsa|id_ed25519|service-account.*\.json)$/i.test(name)) return true;
  if (/\.(pem|key|p12|pfx)$/i.test(name)) return true;
  return false;
}

async function collectFiles(instance, absolutePath, relativePath, results, budget) {
  let entries;
  try {
    entries = await instance.fs.readdir(absolutePath, { withFileTypes: true });
  } catch {
    // A single file can also be packaged by passing its full path.
    const fileBytes = await instance.fs.readFile(absolutePath);
    const bytes = typeof fileBytes === 'string' ? encoder.encode(fileBytes) : new Uint8Array(fileBytes);
    budget.total += bytes.byteLength;
    if (budget.total > budget.maxBytes) throw new Error('This folder is larger than the 100 MB ZIP limit.');
    results.push({ name: relativePath || absolutePath.split('/').pop() || 'file', bytes });
    return;
  }

  for (const entry of entries) {
    if (shouldSkip(entry.name, entry.isDirectory())) continue;
    const nextAbsolute = absolutePath === '/' ? `/${entry.name}` : `${absolutePath}/${entry.name}`;
    const nextRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await collectFiles(instance, nextAbsolute, nextRelative, results, budget);
    } else {
      const raw = await instance.fs.readFile(nextAbsolute);
      const bytes = typeof raw === 'string' ? encoder.encode(raw) : new Uint8Array(raw);
      budget.total += bytes.byteLength;
      if (budget.total > budget.maxBytes) throw new Error('This folder is larger than the 100 MB ZIP limit.');
      results.push({ name: nextRelative, bytes });
      if (results.length > budget.maxFiles) throw new Error('This folder contains too many files to ZIP (limit: 5,000).');
    }
  }
}

function buildStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  const stamp = dosDateTime();
  let localOffset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    if (nameBytes.byteLength > 65535) throw new Error('A filename is too long to include in the ZIP.');
    const crc = crc32(file.bytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800); // UTF-8 filenames
    write16(localView, 8, 0); // Store without compression
    write16(localView, 10, stamp.time);
    write16(localView, 12, stamp.date);
    write32(localView, 14, crc);
    write32(localView, 18, file.bytes.byteLength);
    write32(localView, 22, file.bytes.byteLength);
    write16(localView, 26, nameBytes.length);
    write16(localView, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, file.bytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, stamp.time);
    write16(centralView, 14, stamp.date);
    write32(centralView, 16, crc);
    write32(centralView, 20, file.bytes.byteLength);
    write32(centralView, 24, file.bytes.byteLength);
    write16(centralView, 28, nameBytes.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    localOffset += local.byteLength + file.bytes.byteLength;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, localOffset);
  write16(endView, 20, 0);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

export async function createWorkspaceZip(instance, folderPath = '/') {
  const normalizedPath = normalizeWorkspacePath(folderPath);
  const files = [];
  await collectFiles(instance, normalizedPath, '', files, { total: 0, maxBytes: 100 * 1024 * 1024, maxFiles: 5000 });
  if (!files.length) throw new Error('There are no files in that folder to ZIP yet.');
  const blob = buildStoredZip(files);
  const basename = normalizedPath.split('/').filter(Boolean).pop() || 'figoai-workspace';
  return { blob, fileName: `${basename.replace(/[^a-z0-9._-]+/gi, '-')}.zip`, fileCount: files.length };
}
