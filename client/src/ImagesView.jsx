import { useEffect, useState } from "react";
import { Icons } from "./icons.jsx";

const STYLE_PRESETS = [
  { label: "Caricature", suffix: "playful caricature style, exaggerated features, colorful" },
  { label: "Anime", suffix: "anime style, vibrant colors, cel shaded" },
  { label: "Underwater", suffix: "underwater photography, sunlight rays, dreamy" },
  { label: "Interior design", suffix: "modern interior design photography, warm lighting" },
  { label: "3D avatar", suffix: "3D rendered avatar, pixar style, soft lighting" },
  { label: "Icon design", suffix: "flat icon design, minimal, vector style" },
  { label: "Sticker", suffix: "die-cut sticker style, bold outline, glossy" },
  { label: "Watercolor", suffix: "watercolor painting style, soft edges" },
];

// 2048x2048 keeps parity with 4K's ~8.3-megapixel count in a square frame
// (true 3840x2160 is a widescreen spec that doesn't fit an icon/avatar-sized
// square canvas). "flux" is Pollinations' photorealistic-capable model —
// noticeably sharper and more coherent than their default — and enhance=true
// runs the prompt through their own rewrite step for better composition.
function buildImageUrl(prompt, seed) {
  const params = new URLSearchParams({ width: "2048", height: "2048", model: "flux", enhance: "true", nologo: "true", seed: String(seed) });
  // Quality/detail keywords consistently push Pollinations toward a sharper, more
  // finished result — harmless to add even when a style preset already has its own suffix.
  const fullPrompt = `${prompt}, high quality, detailed, sharp focus`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?${params}`;
}

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export default function ImagesView({ user }) {
  const storageKey = `figoai_images_${user.id}`;
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [images, setImages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(images)); }, [images, storageKey]);

  const generate = async (overridePrompt) => {
    const basePrompt = (overridePrompt ?? prompt).trim();
    if (!basePrompt || generating) return;
    setGenerating(true);
    setError("");
    const seed = Math.floor(Math.random() * 1e9);
    const url = buildImageUrl(basePrompt, seed);
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = () => reject(new Error("Could not generate that image. Try a different description."));
        img.src = url;
      });
      setImages(prev => [{ id: Date.now(), prompt: basePrompt, url, createdAt: new Date().toISOString() }, ...prev]);
      setPrompt("");
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const applyStyle = (suffix) => {
    const base = prompt.trim() || "a striking subject";
    generate(`${base}, ${suffix}`);
  };

  return (
    <div className="library-view">
      <h1 className="view-title">Images</h1>

      <form className="image-prompt-bar" onSubmit={(e) => { e.preventDefault(); generate(); }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the visual you have in mind"
          disabled={generating}
        />
        <button type="submit" className="image-prompt-bar__submit" disabled={generating || !prompt.trim()} title="Generate">
          {generating ? <span className="image-spinner" /> : <Icons.ArrowRight size={18} />}
        </button>
      </form>
      {error && <p className="images-error">{error}</p>}

      <h2 className="view-subtitle">Image styles</h2>
      <div className="style-grid">
        {STYLE_PRESETS.map((s) => (
          <button key={s.label} className="style-card" onClick={() => applyStyle(s.suffix)} disabled={generating}>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {images.length > 0 && (
        <>
          <h2 className="view-subtitle">Your images</h2>
          <div className="image-grid">
            {images.map((img) => (
              <button key={img.id} className="image-grid__item" onClick={() => setPreview(img)}>
                <img src={img.url} alt={img.prompt} loading="lazy" />
                <span>{img.prompt}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="image-lightbox" onClick={(e) => e.stopPropagation()}>
            <img src={preview.url} alt={preview.prompt} />
            <div className="image-lightbox__footer">
              <p>{preview.prompt}</p>
              <div className="image-lightbox__actions">
                <button className="btn-cancel" onClick={() => downloadImage(preview.url, `figoai-${preview.id}.jpg`)}>
                  <Icons.Download size={14} /> Download
                </button>
                <button className="danger-btn" onClick={() => { setImages(prev => prev.filter(i => i.id !== preview.id)); setPreview(null); }}>
                  <Icons.Trash size={14} /> Delete
                </button>
                <button className="btn-cancel" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
