"""Heavier-edit fixtures: a multi-sentence paraphrase of a whole reference segment keeping every fact (PASS), and the
same paraphrase with exactly one number changed (FAIL). Link placeholders {0},{1},... take the reference segment's
markdown links in order."""
from __future__ import annotations

import re

from ..rewrite import segment_article
from .cases import EXP, Case, load_claims

# id -> (segment idx, paraphrase template, text to change, replacement number)
_HEAVY = {
    "a": (20, """At first glance the medical-news section seems like a sharp swerve, but it follows the same argument from perception down to tissue.

Pancreatic ductal adenocarcinoma is among the diseases where optimism must be earned a fraction at a time. Doctors tend to find it late, it spreads quickly, and it has held out against many of the treatments that transformed other cancers. That is why the daraxonrasib result hit with such unusual force.

Daraxonrasib is an oral, multi-selective RAS(ON) inhibitor. In the {0} for previously treated metastatic pancreatic cancer, patients on daraxonrasib had a median overall survival of about 13.2 months, against about 6.7 months on standard chemotherapy. ASCO's {1} and Dana-Farber's {2} land on the same central point: a serious survival signal in a brutal disease.""", "about 13.2 months", "about 15.2 months"),
    "b": (20, """It would be easy to read the medical-news section as an abrupt change of subject. It is not. The argument continues, only now it moves from perception into tissue.

Few diseases make optimism work as hard as pancreatic ductal adenocarcinoma. It usually gets diagnosed late, it spreads fast, and it has resisted a good many of the therapies that changed the outlook for other cancers. So the daraxonrasib result carried unusual weight.

Daraxonrasib, an oral multi-selective RAS(ON) inhibitor, was tested in the {0} in previously treated metastatic pancreatic cancer. Median overall survival came to about 13.2 months with daraxonrasib and about 6.7 months with standard chemotherapy. Both ASCO's {1} and Dana-Farber's {2} make that central point: this is a serious survival signal in a brutal disease.""", "about 6.7 months", "about 9.7 months"),
    "c": (10, """In the old model, consciousness sits in the executive office: we notice, decide, remember, and explain.

The newer picture resembles a building after dark. Nobody is at the front desk, yet some departments carry on working.

Seven epilepsy patients, anesthetized with propofol for surgery, had Neuropixels probes placed deep in the hippocampus, close enough to record single cells. The {0} worked within a brief window of roughly ten to twenty minutes per patient. Access like that is uncommon. The question it asked was simple: what happens when speech and sound reach a brain whose owner will afterward remember none of it?""", "Seven epilepsy patients", "Eleven epilepsy patients"),
    "d": (10, """The old model hands consciousness the executive office, where we notice, decide, remember, and explain. The newer picture is closer to a building at night: the front desk is shut, but some departments are still at work.

Neuropixels probes were placed deep in the hippocampus of seven epilepsy patients who were under propofol anesthesia for surgery, which let them record individual cells. Rare access like this came with a short window in the {0}, about ten to twenty minutes for each patient. The question was a clean one. What happens when speech and sound enter a brain whose owner will later remember none of it?""", "ten to twenty minutes", "thirty to forty minutes"),
    "e": (6, """An engineer can respect fear and still reject the explanation that fear offers him. Tandy shifted the table, watched the blade's vibration swell and fade, and traced the room's dread back to a standing wave of infrasound from the ventilation. A pressure too low for ordinary hearing had found the room's geometry. The case became the classic {0}.

A ghost had turned into a waveform, and the next part reached further. The body can receive a fact before the mind can name it.

A newer {1} pushed the idea on. Researchers paired near-18 Hz infrasound with calm music or anxious ambient sound. Participants guessing whether the hidden low sound was playing did no better than chance. Their saliva was more telling: cortisol rose, and calm music felt gloomier. The emotional weather of the room shifted while the listeners stayed consciously deaf to the signal.""", "near-18 Hz", "near-48 Hz"),
}


def load_heavy_cases() -> list[Case]:
    """5 PASS (hp_*) + 5 FAIL (hf_*)."""
    segs = {s.idx: s for s in segment_article((EXP / "draft-v1.md").read_text())}
    claims = load_claims()
    out: list[Case] = []
    for hid, (idx, tmpl, find, rep) in _HEAVY.items():
        ref = segs[idx].text
        text = tmpl.format(*re.findall(r"\[[^\]]+\]\([^)]*\)", ref))
        assert text.count(find) == 1, f"{hid}: {find!r} occurs {text.count(find)}x"
        out.append(Case(f"hp_{hid}", "PASS", "heavy-paraphrase", idx, tuple(claims[idx]), text, ref))
        out.append(Case(f"hf_{hid}", "FAIL", "heavy-paraphrase+number", idx, tuple(claims[idx]), text.replace(find, rep), ref))
    return out
