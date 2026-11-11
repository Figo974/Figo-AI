#!/usr/bin/env python3
"""Build an inverted token index with byte offsets into processed JSONL files."""
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "processed"
INDEX = ROOT / "index"
INDEX.mkdir(parents=True, exist_ok=True)
TOKEN_RE = re.compile(r"[A-Za-z0-9_]{2,}")
postings = defaultdict(list)
documents = []
indexed_sources = set()

for file in sorted(PROCESSED.glob("*.jsonl")):
    with file.open("rb") as handle:
        line_no = 0
        while True:
            offset = handle.tell()
            raw = handle.readline()
            if not raw:
                break
            current_line = line_no
            line_no += 1
            try:
                row = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if not isinstance(row, dict):
                continue
            text = " ".join(str(row.get(key, "")) for key in ("instruction", "question", "context", "response", "answer"))
            if not text.strip():
                continue
            doc_id = len(documents)
            source = str(row.get("source") or file.stem)
            indexed_sources.add(source)
            documents.append({"id": doc_id, "source": source, "source_file": file.name, "line": current_line, "offset": offset, "length": len(raw)})
            for term in set(token.lower() for token in TOKEN_RE.findall(text)):
                postings[term].append(doc_id)

output = {
    "format": "figoai-lexical-index-v2",
    "document_count": len(documents),
    "term_count": len(postings),
    "documents": documents,
    "postings": postings,
}
out_path = INDEX / "lexical-index.json"
out_path.write_text(json.dumps(output, separators=(",", ":")), encoding="utf-8")
raw_names = ["oasst1", "dolly_15k", "squad", "no_robots", "alpaca"]
raw_present = [name for name in raw_names if (ROOT / "raw" / name).exists() and any((ROOT / "raw" / name).iterdir())]
manifest_path = PROCESSED / "manifest.json"
try:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    manifest = {}
manifest.update({
    "indexed_documents": len(documents),
    "indexed_sources": sorted(indexed_sources),
    "raw_dataset_folders_present": raw_present,
    "index_stale": False,
    "index_format": output["format"],
    "index_bytes": out_path.stat().st_size,
})
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"document_count": len(documents), "term_count": len(postings), "indexed_sources": sorted(indexed_sources), "index": str(out_path), "bytes": out_path.stat().st_size}, indent=2))
