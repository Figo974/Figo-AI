import { useState } from "react";
import { removeBackground } from "@imgly/background-removal";
import { Icons } from "./icons.jsx";

const BG_OPTIONS = [
  { label: "Transparent", value: null },
  { label: "Black", value: "#000000" },
  { label: "White", value: "#ffffff" },
  { label: "Blue", value: "#2563eb" },
  { label: "Green", value: "#16a34a" },
  { label: "Red", value: "#dc2626" },
];

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function compositeOnColor(cutoutBlob, color) {
  const bitmap = await createImageBitmap(cutoutBlob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export default function ImageEditor({ attachment, onClose, onApply }) {
  const [cutout, setCutout] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | processing | ready | error
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("original");
  const [previewUrl, setPreviewUrl] = useState(attachment.url);
  const [customColor, setCustomColor] = useState("#7c3aed");

  const ensureCutout = async () => {
    if (cutout) return cutout;
    setStatus("processing");
    setError("");
    try {
      const blob = await removeBackground(attachment.url, { model: "isnet_quint8", device: "cpu" });
      setCutout(blob);
      return blob;
    } catch {
      setError("Could not process this image — try a different photo.");
      setStatus("error");
      throw new Error("background-removal-failed");
    }
  };

  const choose = async (color) => {
    setSelected(color === null ? "transparent" : color);
    try {
      const cut = await ensureCutout();
      const finalBlob = color === null ? cut : await compositeOnColor(cut, color);
      setPreviewUrl(URL.createObjectURL(finalBlob));
      setStatus("ready");
    } catch {
      // error state already set in ensureCutout
    }
  };

  const handleApply = async () => {
    const res = await fetch(previewUrl);
    const blob = await res.blob();
    const dataUrl = await blobToDataUrl(blob);
    onApply(dataUrl);
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = (attachment.name || "image").replace(/\.[^.]+$/, "") + "-edited.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="image-editor" onClick={(e) => e.stopPropagation()}>
        <div className="image-editor__header">
          <div className="image-editor__title"><Icons.Wand /><h2>Edit Background</h2></div>
          <button onClick={onClose} className="settings-close"><Icons.X /></button>
        </div>

        <div className="image-editor__preview">
          <img src={previewUrl} alt="" />
          {status === "processing" && (
            <div className="image-editor__overlay">
              <div className="typing"><span className="typing__dot" /><span className="typing__dot" /><span className="typing__dot" /></div>
              <span>Removing background…</span>
            </div>
          )}
        </div>

        {error && <p className="password-form__status password-form__status--error">{error}</p>}

        <div className="image-editor__options">
          {BG_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              className={`bg-option ${selected === (opt.value ?? "transparent") ? "active" : ""} ${opt.value === null ? "bg-option--transparent" : ""}`}
              style={opt.value ? { background: opt.value } : undefined}
              onClick={() => choose(opt.value)}
              title={opt.label}
              type="button"
            />
          ))}
          <label className="bg-option bg-option--custom" style={{ background: customColor }} title="Custom color">
            <input
              type="color"
              value={customColor}
              onChange={(e) => { setCustomColor(e.target.value); choose(e.target.value); }}
            />
          </label>
        </div>

        <div className="image-editor__footer">
          <button className="btn-cancel" onClick={onClose} type="button">Cancel</button>
          <button className="btn-cancel" onClick={handleDownload} type="button"><Icons.Download size={14} /> Download</button>
          <button className="btn-save" onClick={handleApply} disabled={status === "processing"} type="button"><Icons.Check /> Use This Image</button>
        </div>
      </div>
    </div>
  );
}
