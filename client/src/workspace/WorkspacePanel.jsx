import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Icons } from '../icons.jsx';

function FileTreeNode({ node, activePath, onSelect, depth }) {
  const [open, setOpen] = useState(depth < 1);
  if (node.type === 'dir') {
    return (
      <div>
        <button type="button" className="workspace-tree__row workspace-tree__row--dir" style={{ paddingLeft: 10 + depth * 14 }} onClick={() => setOpen(v => !v)}>
          <Icons.ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
          <Icons.Folder size={14} />
          <span>{node.name}</span>
        </button>
        {open && node.children.map(child => (
          <FileTreeNode key={child.path} node={child} activePath={activePath} onSelect={onSelect} depth={depth + 1} />
        ))}
      </div>
    );
  }
  return (
    <button type="button" className={`workspace-tree__row ${activePath === node.path ? 'active' : ''}`} style={{ paddingLeft: 10 + depth * 14 }} onClick={() => onSelect(node.path)}>
      <Icons.File size={14} />
      <span>{node.name}</span>
    </button>
  );
}

export default function WorkspacePanel({ workspace, onClose }) {
  const { status, tree, boot, attachTerminal, readFile, writeFile } = workspace;
  const [activePath, setActivePath] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const terminalHostRef = useRef(null);

  useEffect(() => { boot(); }, [boot]);

  useEffect(() => {
    if (status !== 'ready' || !terminalHostRef.current) return;
    const term = new XTerm({
      convertEol: true,
      fontSize: 13,
      theme: { background: '#151517' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalHostRef.current);
    fit.fit();

    let disposeShell = () => {};
    let cancelled = false;
    attachTerminal(term).then((dispose) => { if (cancelled) dispose(); else disposeShell = dispose; });

    const resizeObserver = new ResizeObserver(() => { try { fit.fit(); } catch { /* host not laid out yet */ } });
    resizeObserver.observe(terminalHostRef.current);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      disposeShell();
      term.dispose();
    };
  }, [status, attachTerminal]);

  const openFile = async (path) => {
    setActivePath(path);
    setLoadingFile(true);
    try {
      setFileContent(await readFile(path));
      setDirty(false);
    } catch (err) {
      setFileContent(`// Could not read this file: ${err?.message || err}`);
    }
    setLoadingFile(false);
  };

  const saveFile = async () => {
    if (!activePath) return;
    await writeFile(activePath, fileContent);
    setDirty(false);
  };

  return (
    <div className="workspace-panel">
      <div className="workspace-panel__header">
        <span><Icons.Terminal size={15} /> Workspace</span>
        <button type="button" className="action-btn" onClick={onClose} title="Close Workspace"><Icons.X size={15} /></button>
      </div>

      {status !== 'ready' ? (
        <div className="workspace-panel__boot">
          {status === 'error'
            ? "Couldn't start the sandbox in this browser. Workspace needs a Chromium-based browser (Chrome, Edge, Brave) — it isn't supported in Safari."
            : 'Starting sandbox…'}
        </div>
      ) : (
        <div className="workspace-panel__body">
          <div className="workspace-tree">
            {tree.length === 0 ? (
              <p className="workspace-tree__empty">No files yet — ask the assistant to create one, or use the terminal below.</p>
            ) : tree.map(node => (
              <FileTreeNode key={node.path} node={node} activePath={activePath} onSelect={openFile} depth={0} />
            ))}
          </div>

          <div className="workspace-main">
            <div className="workspace-editor">
              {activePath ? (
                <>
                  <div className="workspace-editor__bar">
                    <span>{activePath}</span>
                    {dirty && <button type="button" className="workspace-editor__save" onClick={saveFile}>Save</button>}
                  </div>
                  <textarea
                    className="workspace-editor__textarea"
                    value={fileContent}
                    disabled={loadingFile}
                    onChange={(e) => { setFileContent(e.target.value); setDirty(true); }}
                    spellCheck={false}
                  />
                </>
              ) : (
                <div className="workspace-editor__placeholder">Select a file to view or edit it.</div>
              )}
            </div>
            <div className="workspace-terminal" ref={terminalHostRef} />
          </div>
        </div>
      )}
    </div>
  );
}
