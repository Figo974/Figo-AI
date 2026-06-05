import { useEffect, useState } from "react";
import App from "./App.jsx";
import Login from "./Login.jsx";

const AUTH_KEY = "figoai_auth";

function getPath() {
  return window.location.pathname || "/";
}

export default function Router() {
  const [path, setPath] = useState(getPath());
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const onPop = () => setPath(getPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) {
        setAuthed(false);
        return;
      }
      // ensure it is valid json
      JSON.parse(raw);
      setAuthed(true);
    } catch {
      setAuthed(false);
    }
  }, []);

  // Accessible "/login" page (client-side). Chat is protected.
  if (path === "/login" || path === "/login/") {
    return <Login />;
  }

  if (!authed) {
    // redirect to /login if not authenticated
    if (path !== "/login" && path !== "/login/") {
      window.history.replaceState({}, "", "/login");
      setPath("/login");
    }
    return <Login />;
  }

  return <App />;
}

