"""Deterministic assembly of the final frame (title, subtitle, images) around a body, and the HTML render.

The same function builds the candidate (around the anti-fingerprint body) and the reference frame (around the pre-anti-
fingerprint body), so the final integrity gate compares two texts whose only differences are body edits.
"""
from __future__ import annotations

import html

from . import mdlib as M
from scripts.fingerprint_eval.textutil import md_parser


def _image_block(im: dict) -> str:
    return f"![{im['alt']}]({im['path']})\n\n*{im['caption']}*\n"


def assemble(body_text: str, title: str, subtitle: str, images: list[dict]) -> str:
    body = M.body_without_frame(body_text)
    heroes = [i for i in images if i["placement"] == "hero"]
    after_head = {M.norm(i["placement"][6:]): i for i in images if i["placement"].startswith("after:")}
    after_par = {int(i["placement"][16:]): i for i in images if i["placement"].startswith("after-paragraph:")}
    out = [f"# {title}", f"### {subtitle}"] + [_image_block(i).rstrip("\n") for i in heroes]
    n_par = 0
    for b in M.blocks(body):
        out.append(b.text.rstrip("\n"))
        if b.kind == "heading":
            hit = after_head.get(M.norm(b.text.lstrip("# ").strip()))
            if hit:
                out.append(_image_block(hit).rstrip("\n"))
        elif b.kind == "paragraph" and not b.text.lstrip().startswith("!"):
            n_par += 1
            if n_par in after_par:
                out.append(_image_block(after_par[n_par]).rstrip("\n"))
    return "\n\n".join(out).rstrip("\n") + "\n"


def to_html(text: str, title: str) -> str:
    """Markdown to HTML with fenced blocks rendered as <pre><code>, the subtitle as <h3> right under the title. No tables."""
    body = md_parser().render(text)
    return ("<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f"<meta name=\"robots\" content=\"noindex\"><title>{html.escape(title)}</title>\n"
            "<style>body{max-width:42rem;margin:2rem auto;padding:0 1rem;background:#faf7f2;color:#1f1b16;font:18px/1.6 Georgia,serif}"
            "pre{background:#f0eadf;padding:1rem;overflow-wrap:anywhere;white-space:pre-wrap;font:16px/1.5 ui-monospace,Menlo,monospace}"
            "code{background:#f0eadf;font-family:ui-monospace,Menlo,monospace}pre code{background:none}img{max-width:100%;height:auto}"
            "@media(max-width:480px){pre{font-size:15px}}</style></head>\n<body>\n" + body + "</body></html>\n")
