import { useEffect, useState } from "react";
import { Icons } from "./icons.jsx";

export function loadProjects(userId) {
  try { return JSON.parse(localStorage.getItem(`figoai_projects_${userId}`) || "[]"); } catch { return []; }
}

export default function ProjectsView({ user, chats, onOpenChat }) {
  const storageKey = `figoai_projects_${user.id}`;
  const [projects, setProjects] = useState(() => loadProjects(user.id));
  const [activeProject, setActiveProject] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(projects)); }, [projects, storageKey]);

  const createProject = (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setProjects(prev => [{ id: Date.now(), name, createdAt: new Date().toISOString() }, ...prev]);
    setNewName("");
    setCreating(false);
  };

  const deleteProject = (id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProject === id) setActiveProject(null);
  };

  const projectChats = activeProject ? chats.filter(c => c.projectId === activeProject) : [];
  const currentProject = projects.find(p => p.id === activeProject);

  if (activeProject) {
    return (
      <div className="library-view">
        <button className="back-link" onClick={() => setActiveProject(null)}><Icons.ChevronLeft size={16} /> All projects</button>
        <h1 className="view-title">{currentProject?.name || "Project"}</h1>
        {projectChats.length === 0 ? (
          <div className="no-chats">
            <Icons.MessageSquare />
            <p>No conversations yet</p>
            <span>Open a chat and use "Add to project" to add it here</span>
          </div>
        ) : (
          <div className="sidebar__chats" style={{ padding: 0 }}>
            {projectChats.map(chat => (
              <div key={chat.id} className="chat-item" onClick={() => onOpenChat(chat.id)}>
                <Icons.MessageSquare />
                <div className="chat-item__info">
                  <span className="chat-item__title">{chat.title}</span>
                  <span className="chat-item__date">{new Date(chat.updatedAt || chat.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="library-view">
      <div className="library-view__header">
        <h1 className="view-title">Projects</h1>
        <button className="new-chat-btn" style={{ width: "auto", margin: 0 }} onClick={() => setCreating(v => !v)}>
          <Icons.Plus size={16} /> New Project
        </button>
      </div>

      {creating && (
        <form className="image-prompt-bar" onSubmit={createProject} style={{ marginBottom: 20 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Project name" autoFocus />
          <button type="submit" className="image-prompt-bar__submit" disabled={!newName.trim()}><Icons.Check size={16} /></button>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="no-chats">
          <Icons.File />
          <p>No projects yet</p>
          <span>Create one, then add chats to it from the sidebar</span>
        </div>
      ) : (
        <div className="style-grid">
          {projects.map((p) => (
            <div key={p.id} className="style-card project-card" onClick={() => setActiveProject(p.id)}>
              <span>{p.name}</span>
              <span className="project-card__count">{chats.filter(c => c.projectId === p.id).length} chats</span>
              <button className="project-card__delete" onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }} title="Delete project"><Icons.Trash size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
