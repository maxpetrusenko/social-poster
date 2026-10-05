"""Optional external cross-check lanes, merged into an existing experiment dir.

- pystylometry (installed in a separate uv venv, py3.12): Burrows/Cosine Delta of each text vs pooled author corpus.
- reweave `score` (oss clone, Apache/unlicensed: invoked as a separate process, code never copied here), offline only.
  Observational, NOT an optimization target. Its --regenerate lane needs the Ollama-native API and is recorded as skipped.

python -m scripts.fingerprint_eval.external --out experiments/<slug> --author-corpus DIR --stylometry-python VENV/bin/python --reweave-src OSS/src
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from .gateway import child_env
from .textutil import body_text, core_markdown, load_author_corpus

_ENV_KEYS = ("PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "VIRTUAL_ENV", "UV_CACHE_DIR")  # no API keys or tokens reach the lanes

STY = r'''
import json, sys
from pystylometry.authorship import compute_burrows_delta
d = json.load(sys.stdin)
out = {}
for name, text in d["texts"].items():
    b = compute_burrows_delta(d["author"], text, mfw=300)
    c = compute_burrows_delta(d["author"], text, mfw=300, distance_type="cosine")
    out[name] = {"burrows_delta": b.delta_score, "cosine_delta": c.delta_score}
print(json.dumps(out))
'''


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--author-corpus", required=True, type=Path)
    ap.add_argument("--stylometry-python", type=Path)
    ap.add_argument("--reweave-src", type=Path)
    a = ap.parse_args()
    files = {"original": a.out / "draft-v1.md", **{p.stem.replace("rewrite-", ""): p for p in sorted(a.out.glob("rewrite-*.md"))}}
    texts = {k: body_text(core_markdown(f.read_text())) for k, f in files.items()}
    lanes: dict = {}

    if a.stylometry_python and a.stylometry_python.exists():
        author = "\n\n".join(t for _, t in load_author_corpus(a.author_corpus))
        p = subprocess.run([str(a.stylometry_python), "-c", STY], input=json.dumps({"author": author, "texts": texts}), capture_output=True, text=True, env=child_env(_ENV_KEYS))
        lanes["pystylometry"] = json.loads(p.stdout) if p.returncode == 0 else {"skipped": True, "error": p.stderr[-300:]}
    else:
        lanes["pystylometry"] = {"skipped": True, "reason": "no --stylometry-python"}

    if a.reweave_src:
        res = {}
        for k, f in files.items():
            p = subprocess.run(["uv", "run", "--python", "3.12", "--no-project", "python", "-c", "import sys;from reweave.cli import main;sys.exit(main(['score',sys.argv[1]]))", str(f)],
                               capture_output=True, text=True, env={**child_env(_ENV_KEYS), "PYTHONPATH": str(a.reweave_src)})
            m = re.search(r"human-signature:\s*([0-9.]+)", p.stdout)
            res[k] = float(m.group(1)) if m else {"error": (p.stderr or p.stdout)[-200:]}
        lanes["reweave_score_human_signature"] = {"observational_only": True, "values": res}
        lanes["reweave_regenerate"] = {"skipped": True, "reason": "reweave's regenerate/extract/guard clients call the Ollama-native API (/api/generate, /api/embeddings) at host http://localhost:11434; the gateway is OpenAI-compatible only (/v1/*) and no local ollama binary exists on this Mac or mini. A shim would be new code beyond the 20 min budget."}

    mp = a.out / "metrics.json"
    m = json.loads(mp.read_text())
    m["external_lanes"] = lanes
    mp.write_text(json.dumps(m, indent=2))
    rp = a.out / "report.md"
    txt = rp.read_text()
    txt = re.sub(r"\n## External lanes.*?(?=\n## |\Z)", "", txt, flags=re.S)
    sec = ["", "## External lanes (cross-checks, observational)", ""]
    sty = lanes["pystylometry"]
    if sty.get("skipped"):
        sec.append(f"- pystylometry: skipped, {sty.get('reason') or sty.get('error')}")
    else:
        sec += ["- pystylometry 1.4.3 Delta vs pooled author corpus (mfw 300; lower = closer):", "", "| text | Burrows Delta | Cosine Delta |", "|---|---|---|"]
        sec += [f"| {k} | {v['burrows_delta']:.3f} | {v['cosine_delta']:.3f} |" for k, v in sty.items()]
    rs = lanes.get("reweave_score_human_signature")
    if rs:
        sec += ["", "- reweave `score` human-signature (offline; observational only, not an optimization target): " + ", ".join(f"{k} {v if not isinstance(v, dict) else 'error'}" for k, v in rs["values"].items())]
        sec.append(f"- reweave regenerate: skipped. {lanes['reweave_regenerate']['reason']}")
    rp.write_text(txt.rstrip() + "\n" + "\n".join(sec) + "\n")
    print("external lanes merged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
