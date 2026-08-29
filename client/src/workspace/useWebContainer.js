import { useCallback, useRef, useState } from 'react';
import { WebContainer } from '@webcontainer/api';

// WebContainer.boot() may only run once per page load — share a single
// instance across every component/hook call instead of re-booting per chat.
let containerPromise = null;
function getContainer() {
  if (!containerPromise) {
    containerPromise = WebContainer.boot().then(async (instance) => {
      // A bare package.json means `npm install <pkg>` and `npm run ...`
      // work right away without the assistant having to `npm init` first.
      await instance.fs.writeFile('/package.json', JSON.stringify({ name: 'workspace', version: '1.0.0', private: true }, null, 2));
      return instance;
    });
  }
  return containerPromise;
}

const EXCLUDED_DIRS = new Set(['node_modules', '.git']);

async function ensureParentDir(instance, filePath) {
  const parent = filePath.split('/').slice(0, -1).join('/');
  if (parent) await instance.fs.mkdir(parent, { recursive: true });
}

async function listTree(instance, dir = '/', depth = 0) {
  if (depth > 6) return [];
  let entries;
  try {
    entries = await instance.fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const entryPath = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, path: entryPath, type: 'dir', children: await listTree(instance, entryPath, depth + 1) });
    } else {
      nodes.push({ name: entry.name, path: entryPath, type: 'file' });
    }
  }
  return nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
}

function flattenForToolResult(nodes, prefix = '') {
  let lines = [];
  for (const node of nodes) {
    lines.push(prefix + node.path + (node.type === 'dir' ? '/' : ''));
    if (node.children) lines = lines.concat(flattenForToolResult(node.children));
  }
  return lines;
}

// Runs one command to completion and returns its combined output — used both
// for the assistant's run_command tool and for anything the caller wants a
// plain string result from (e.g. `npm install` before boot-strapping a repo).
async function runToCompletion(instance, command, onChunk) {
  const process = await instance.spawn('jsh', ['-c', command]);
  let output = '';
  process.output.pipeTo(new WritableStream({
    write(chunk) {
      output += chunk;
      onChunk?.(chunk);
    },
  }));
  const exitCode = await process.exit;
  return { output, exitCode };
}

export function useWebContainer() {
  const [status, setStatus] = useState('idle'); // idle | booting | ready | error
  const [tree, setTree] = useState([]);
  const instanceRef = useRef(null);
  const shellRef = useRef(null); // the persistent interactive jsh process, once a terminal attaches

  const refreshTree = useCallback(async () => {
    if (!instanceRef.current) return;
    setTree(await listTree(instanceRef.current));
  }, []);

  const boot = useCallback(async () => {
    if (instanceRef.current) return instanceRef.current;
    setStatus('booting');
    try {
      const instance = await getContainer();
      instanceRef.current = instance;
      instance.fs.watch('/', { recursive: true }, () => { refreshTree(); });
      setStatus('ready');
      await refreshTree();
      return instance;
    } catch (err) {
      console.error('WebContainer failed to boot:', err);
      setStatus('error');
      throw err;
    }
  }, [refreshTree]);

  // Attaches an interactive shell to the given xterm instance. Returns a
  // disposer. Safe to call more than once (e.g. panel remount) — reuses the
  // same underlying process where possible isn't attempted; a fresh jsh
  // process is spawned per attach, which is cheap.
  const attachTerminal = useCallback(async (term) => {
    const instance = instanceRef.current || (await boot());
    const shell = await instance.spawn('jsh', [], {
      terminal: { cols: term.cols, rows: term.rows },
    });
    shellRef.current = shell;
    shell.output.pipeTo(new WritableStream({ write(chunk) { term.write(chunk); } }));
    const input = shell.input.getWriter();
    const dataDisposable = term.onData((data) => { input.write(data); });
    const resizeDisposable = term.onResize(({ cols, rows }) => { shell.resize({ cols, rows }); });
    return () => { dataDisposable.dispose(); resizeDisposable.dispose(); shell.kill(); };
  }, [boot]);

  const readFile = useCallback(async (path) => {
    const instance = instanceRef.current || (await boot());
    return instance.fs.readFile(path, 'utf-8');
  }, [boot]);

  const writeFile = useCallback(async (path, content) => {
    const instance = instanceRef.current || (await boot());
    await ensureParentDir(instance, path);
    await instance.fs.writeFile(path, content);
    await refreshTree();
  }, [boot, refreshTree]);

  const runCommand = useCallback(async (command) => {
    const instance = instanceRef.current || (await boot());
    const result = await runToCompletion(instance, command);
    await refreshTree();
    return result;
  }, [boot, refreshTree]);

  // Executes one Groq tool_call against the sandbox and returns the string
  // to send back as that tool message's content.
  const runToolCall = useCallback(async (toolCall) => {
    const name = toolCall?.function?.name;
    let args = {};
    try { args = JSON.parse(toolCall?.function?.arguments || '{}'); } catch { /* malformed args from the model — treat as empty */ }

    try {
      if (name === 'read_file') {
        return await readFile(args.path);
      }
      if (name === 'write_file') {
        await writeFile(args.path, args.content ?? '');
        return `Wrote ${args.path}`;
      }
      if (name === 'list_dir') {
        const instance = instanceRef.current || (await boot());
        const nodes = await listTree(instance, args.path || '/');
        const lines = flattenForToolResult(nodes);
        return lines.length ? lines.join('\n') : '(empty)';
      }
      if (name === 'run_command') {
        const { output, exitCode } = await runCommand(args.command);
        return `$ ${args.command}\n${output}\n(exit code ${exitCode})`;
      }
      return `Unknown tool: ${name}`;
    } catch (err) {
      return `Error: ${err?.message || String(err)}`;
    }
  }, [readFile, writeFile, runCommand, boot]);

  return { status, tree, boot, attachTerminal, readFile, writeFile, runCommand, runToolCall };
}
