import { useMemo, useState } from "react";
import { Icons } from "./icons.jsx";

function estimateDataUrlBytes(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const base64 = dataUrl.split(",")[1] || "";
  return Math.round(base64.length * 0.75);
}

function formatBytes(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function getLibraryItems(user, chats) {
  const fromAttachments = [];
  for (const chat of chats) {
    for (const msg of (chat.messages || [])) {
      for (const att of (msg.attachments || [])) {
        fromAttachments.push({
          id: `att-${chat.id}-${fromAttachments.length}`,
          name: att.name,
          type: att.type,
          url: att.url,
          modified: chat.updatedAt || chat.createdAt,
          bytes: estimateDataUrlBytes(att.url),
        });
      }
    }
  }
  let generatedImages = [];
  try { generatedImages = JSON.parse(localStorage.getItem(`figoai_images_${user.id}`) || "[]"); } catch { generatedImages = []; }
  const fromGenerated = generatedImages.map((img) => ({
    id: `gen-${img.id}`,
    name: img.prompt,
    type: "image",
    url: img.url,
    modified: img.createdAt,
    bytes: null,
  }));
  return [...fromGenerated, ...fromAttachments].sort((a, b) => new Date(b.modified) - new Date(a.modified));
}

export function getLibraryStats(user, chats) {
  const items = getLibraryItems(user, chats);
  const summarize = (list) => ({ count: list.length, bytes: list.reduce((sum, i) => sum + (i.bytes || 0), 0) });
  return {
    images: summarize(items.filter((i) => i.type === "image")),
    files: summarize(items.filter((i) => i.type === "file")),
  };
}

export default function LibraryView({ user, chats, initialTab }) {
  const [tab, setTab] = useState(initialTab || "all"); // all | images | documents
  const [search, setSearch] = useState("");

  const items = useMemo(() => getLibraryItems(user, chats), [user, chats]);

  const filtered = items
    .filter((i) => tab === "all" || (tab === "images" && i.type === "image") || (tab === "documents" && i.type === "file"))
    .filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="library-view">
      <div className="library-view__header">
        <h1 className="view-title">Library</h1>
        <div className="library-view__search">
          <Icons.Search size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
        </div>
      </div>

      <div className="library-tabs">
        <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All</button>
        <button className={tab === "images" ? "active" : ""} onClick={() => setTab("images")}>Images</button>
        <button className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}>Documents</button>
      </div>

      {filtered.length === 0 ? (
        <div className="no-chats">
          <Icons.File />
          <p>Nothing here yet</p>
          <span>Generated images and file attachments from your chats will show up here</span>
        </div>
      ) : (
        <div className="library-table">
          <div className="library-table__row library-table__row--head">
            <span>Name</span><span>Modified</span><span>Size</span>
          </div>
          {filtered.map((item) => (
            <div key={item.id} className="library-table__row">
              <span className="library-table__name">
                {item.type === "image" ? <img src={item.url} alt="" /> : <Icons.File size={16} />}
                <span>{item.name}</span>
              </span>
              <span>{new Date(item.modified).toLocaleString()}</span>
              <span>{formatBytes(item.bytes)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
