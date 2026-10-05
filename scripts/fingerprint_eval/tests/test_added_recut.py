"""added.new_sentences: a benign split or merge is not an addition; a new sentence reusing a retained sentence's words still is."""
from scripts.fingerprint_eval import added

REF = ("# T\n\n## S\n\nThe benchmark, the audit, and the red team are scored by machinery the model can read, and so is the deployment. "
       "Researchers measured the blackmail rate at 55 percent across three labs. Regulators published the findings in a long report.\n")


def new(final_body: str) -> dict:
    return added.new_sentences(REF, f"# T\n\n## S\n\n{final_body}\n")


def test_split_fragment_is_not_new():
    assert new("The benchmark, the audit, and the red team are scored by machinery the model can read. So is the deployment. "
               "Researchers measured the blackmail rate at 55 percent across three labs. Regulators published the findings in a long report.") == {}


def test_merge_is_not_new():
    assert new("The benchmark, the audit, and the red team are scored by machinery the model can read, and so is the deployment, "
               "while researchers measured the blackmail rate at 55 percent across three labs. Regulators published the findings in a long report.") == {}


def test_fragment_of_a_retained_sentence_is_still_checked():
    assert new(REF.split("\n\n")[2] + " Deployment scored.")  # the reference sentence is still whole: the extra fragment is an addition


def test_added_number_in_a_merge_is_new():
    assert new("The benchmark, the audit, and the red team are scored by machinery the model can read, and so is the deployment, "
               "while researchers measured the blackmail rate at 75 percent across three labs. Regulators published the findings in a long report.")
