"""Held-out set 2 (W12b): the set that counts. Article: a THIRD real article, different from the earlier calibration
(body-thinks-before-mind) and from set 1 (ai-born-9-seconds): youtube-immune-system-actually-works-lxfek8g8cui/article-v11.md,
copied read-only from the mini into article.md.

Labels are fixed here and committed BEFORE any model call. Nothing in this file, claimcheck.py, judge.py, added.py or the
extraction prompt may be edited after the run of this set. PASS = harmless edit, the gate must not fail. FAIL = factual
change, the gate must fail. Same 12 categories as set 1, 4 cases each, each a minimal edit of one place in the article;
every `find` must occur exactly once in the article. Paraphrases were written the way a careful editor would, not tuned to
the gate (nobody had run this article through it).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

H = Path(__file__).parent

_RAW = [
    # ---- PASS: paraphrase ----
    ("pa1", "PASS", "paraphrase", [("A cut thumb should be boring from your side of the glass. You catch it on a dirty twig, rinse it, maybe swear, and later notice the red warmth and swelling before the skin closes over.",
                                      "From your side of the glass, a cut thumb should be dull. You snag it on a filthy twig, wash it off, maybe curse, and later see the red warmth and swelling before the skin seals over.")]),
    ("pa2", "PASS", "paraphrase", [("Neutrophils are the ugly speed layer, short-lived, aggressive, disposable by design, and sometimes willing to die as part of the attack.",
                                      "Neutrophils make up the crude speed layer: they live briefly, act aggressively, are disposable by design, and sometimes will die as part of the attack.")]),
    ("pa3", "PASS", "paraphrase", [("Antibodies bind bacteria, clump them, neutralize them, mark them, and make them easier for other cells to destroy.",
                                      "Antibodies latch onto bacteria, glue them together, neutralize them, tag them, and make it easier for other cells to destroy them.")]),
    ("pa4", "PASS", "paraphrase", [("Demobilization is the least glamorous part of immunity, even though a defense system missing a stop rule becomes dangerous by continuing to defend.",
                                      "Standing the army down is the least glamorous part of immunity, though a defense system without a stop rule turns dangerous by never ceasing to defend.")]),
    # ---- PASS: merge two sentences ----
    ("pm1", "PASS", "merge", [("when it spills into tissue. Dirt on a path is scenery,", "when it spills into tissue, and dirt on a path is scenery,")]),
    ("pm2", "PASS", "merge", [("Antibodies are shaped tools. A B cell that matches the invader clones itself,", "Antibodies are shaped tools, and a B cell that matches the invader clones itself,")]),
    ("pm3", "PASS", "merge", [("to a lymph node. The [National Cancer Institute]", "to a lymph node, and the [National Cancer Institute]")]),
    ("pm4", "PASS", "merge", [("activates the targeted response. Local damage becomes", "activates the targeted response, and local damage becomes")]),
    # ---- PASS: split one sentence ----
    ("ps1", "PASS", "split", [("Wounded tissue sets off alarms, innate cells attack fast and messily, inflammation opens supply lines, dendritic cells carry",
                               "Wounded tissue sets off alarms. Innate cells attack fast and messily, and inflammation opens supply lines. Dendritic cells carry")]),
    ("ps2", "PASS", "split", [("The first signal is broken tissue because cells spilling their contents into the wrong place change the meaning of ordinary molecules.",
                               "The first signal is broken tissue. Cells spilling their contents into the wrong place change the meaning of ordinary molecules.")]),
    ("ps3", "PASS", "split", [("Inflammation has terrible branding, partly because chronic inflammation can wreck tissue and partly because acute inflammation feels like damage from the outside.",
                               "Inflammation has terrible branding. Partly that is because chronic inflammation can wreck tissue, and partly it is because acute inflammation feels like damage from the outside.")]),
    ("ps4", "PASS", "split", [("The adaptive response is powerful and slow because precision has search cost.", "The adaptive response is powerful. It is also slow, because precision has search cost.")]),
    # ---- PASS: reordered wording ----
    ("pr1", "PASS", "reorder", [("including skin, mucus, vessel walls, cell membranes, lymph channels, gut lining, bone marrow, and lymph nodes",
                                 "including bone marrow, lymph nodes, skin, mucus, vessel walls, cell membranes, lymph channels, and gut lining")]),
    ("pr2", "PASS", "reorder", [("Macrophages, neutrophils, complement proteins, chemical alarms, fluid, heat, and swelling buy time",
                                 "Fluid, heat, swelling, chemical alarms, complement proteins, neutrophils, and macrophages buy time")]),
    ("pr3", "PASS", "reorder", [("The right helper T cell has to be found, activated, and copied until there are thousands.",
                                 "Until there are thousands, the right helper T cell has to be found, activated, and copied.")]),
    ("pr4", "PASS", "reorder", [("In biology it takes time, cloning, signaling, tissue damage, cleanup, and energy.", "In biology it takes energy, cleanup, tissue damage, signaling, cloning, and time.")]),
    # ---- FAIL: changed number ----
    ("fn1", "FAIL", "number", [("\"about 2,000 molecules per second\"", "\"about 20,000 molecules per second\"")]),
    ("fn2", "FAIL", "number", [("A week can pass between the dirty twig", "Three weeks can pass between the dirty twig")]),
    ("fn3", "FAIL", "number", [("antigen receptors of one specificity", "antigen receptors of two specificities")]),
    ("fn4", "FAIL", "number", [("copied until there are thousands.", "copied until there are millions.")]),
    # ---- FAIL: changed entity ----
    ("fe1", "FAIL", "entity", [("Janeway's *Immunobiology* describes inflammation as", "Alberts' *Molecular Biology of the Cell* describes inflammation as")]),
    ("fe2", "FAIL", "entity", [("Macrophages are big local eaters", "Neutrophils are big local eaters")]),
    ("fe3", "FAIL", "entity", [("through the lymphatic system to a lymph node", "through the lymphatic system to the spleen")]),
    ("fe4", "FAIL", "entity", [("Others help activate B cells, the factories", "Others help activate T cells, the factories")]),
    # ---- FAIL: reversed causality ----
    ("fc1", "FAIL", "causality", [("The tissue swells because fluid moves where fluid usually stays out, vessels loosen,", "Fluid moves where fluid usually stays out because the tissue swells, vessels loosen,")]),
    ("fc2", "FAIL", "causality", [("The adaptive response is powerful and slow because precision has search cost.", "Precision has search cost because the adaptive response is powerful and slow.")]),
    ("fc3", "FAIL", "causality", [("Most helper T cells ignore the evidence because the match is wrong, the shape is wrong, or the context is wrong.",
                                   "The match is wrong, the shape is wrong, or the context is wrong because most helper T cells ignore the evidence.")]),
    ("fc4", "FAIL", "causality", [("The body accepts collateral damage in the first phase because slow precision can lose the organism before the precision is ready.",
                                   "Slow precision can lose the organism before the precision is ready because the body accepts collateral damage in the first phase.")]),
    # ---- FAIL: deleted or swapped qualifier ----
    ("fq1", "FAIL", "qualifier", [("partly because chronic inflammation can wreck tissue and partly", "partly because chronic inflammation wrecks tissue and partly")]),
    ("fq2", "FAIL", "qualifier", [("Most helper T cells ignore the evidence", "All helper T cells ignore the evidence")]),
    ("fq3", "FAIL", "qualifier", [("The answer is usually yes, because", "The answer is yes, because")]),
    ("fq4", "FAIL", "qualifier", [("Some T cells and B cells remain as the memory of the fight", "T cells and B cells remain as the memory of the fight")]),
    # ---- FAIL: raised certainty ----
    ("fk1", "FAIL", "certainty", [("(NETs) describes cells casting", "(NETs) demonstrates cells casting")]),
    ("fk2", "FAIL", "certainty", [("*Immunobiology* explains that each naive lymphocyte", "*Immunobiology* proves that each naive lymphocyte")]),
    ("fk3", "FAIL", "certainty", [("Getting the timing right matters more than getting the intensity right.", "Getting the timing right is proven to matter more than getting the intensity right.")]),
    ("fk4", "FAIL", "certainty", [("which explains why ordinary sickness can feel long", "which proves why ordinary sickness can feel long")]),
    # ---- FAIL: added unsupported claim ----
    ("fa1", "FAIL", "added-claim", [("part of the attack. Research on neutrophil", "part of the attack. Roughly half of all white blood cells in an adult are neutrophils. Research on neutrophil")]),
    ("fa2", "FAIL", "added-claim", [("owns the right weapon for this enemy.", "owns the right weapon for this enemy. The human body contains about 600 lymph nodes.")]),
    ("fa3", "FAIL", "added-claim", [("is a small red mark.\n\nFor a useful next read", "is a small red mark. A 2019 trial found that sleep deprivation cuts antibody production by half.\n\nFor a useful next read")]),
    ("fa4", "FAIL", "added-claim", [("Antibodies are shaped tools. A B cell", "Antibodies are shaped tools. Each antibody molecule is built from four protein chains. A B cell")]),
    # ---- FAIL: removed claim (whole sentence or paragraph dropped) ----
    ("fr1", "FAIL", "removed-claim", [(" Dirt on a path is scenery, but dirt inside a wound triggers a response.", "")]),
    ("fr2", "FAIL", "removed-claim", [(" A neutrophil can rupture and spill its own genetic material into the surrounding tissue, creating a mesh that traps and kills bacteria.", "")]),
    ("fr3", "FAIL", "removed-claim", [("The body accepts collateral damage in the first phase because slow precision can lose the organism before the precision is ready.\n\n", "")]),
    ("fr4", "FAIL", "removed-claim", [("Antibodies bind bacteria, clump them, neutralize them, mark them, and make them easier for other cells to destroy. ", "")]),
    # ---- FAIL: very short factual claim flipped ----
    ("fs1", "FAIL", "short-claim", [("A response that is weak against a real threat can kill you.", "A response that is weak against a real threat cannot kill you.")]),
    ("fs2", "FAIL", "short-claim", [("Complement proteins in fluid punch holes in bacterial membranes", "Complement proteins in fluid repair holes in bacterial membranes")]),
    ("fs3", "FAIL", "short-claim", [("Demobilization is the least glamorous part of immunity", "Demobilization is the most glamorous part of immunity")]),
    ("fs4", "FAIL", "short-claim", [("Antibodies are shaped tools.", "Antibodies are blunt tools.")]),
    # ---- PASS: unchanged article (byte-identical final) ----
    ("i01", "PASS", "identity", []),
]


@dataclass(frozen=True)
class Case:
    id: str
    label: str
    category: str
    final: str


def load_article() -> str:
    return (H / "article.md").read_text()


def load_cases() -> list[Case]:
    art = load_article()
    out = []
    for cid, label, cat, edits in _RAW:
        final = art
        for find, rep in edits:
            assert art.count(find) == 1, f"{cid}: {find[:60]!r} occurs {art.count(find)}x"
            final = final.replace(find, rep)
        assert (final != art) == bool(edits), cid
        out.append(Case(cid, label, cat, final))
    return out
