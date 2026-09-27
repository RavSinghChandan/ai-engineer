import json
import pytest
from fake_typesafe import Choice, Noul
from calibrate import criteria_hash, fit_threshold, reliability, write_lock

Q = {
    "team": Choice(instructions="Which team?",
                   criteria={"a": "alpha", "b": "beta"}),
    "urgent": Noul(instructions="This is urgent"),
}


def test_perfect_separation_finds_low_threshold():
    records = [(0.9, 1)] * 50 + [(0.3, 0)] * 50
    t, p, cov = fit_threshold(records, 0.95)
    assert t == 0.9 and p == 1.0 and cov == 0.5


def test_raises_when_target_unreachable():
    records = [(0.9, 0)] * 10 + [(0.8, 1)] * 10
    with pytest.raises(ValueError, match="no threshold reaches"):
        fit_threshold(records, 0.95)


def test_higher_target_gives_lower_coverage():
    records = [(0.95, 1)] * 30 + [(0.8, 1)] * 30 + [(0.8, 0)] * 10
    _, _, cov_strict = fit_threshold(records, 0.99)
    _, _, cov_loose = fit_threshold(records, 0.85)
    assert cov_strict < cov_loose


def test_reliability_detects_overconfidence():
    records = [(0.95, 0)] * 70 + [(0.95, 1)] * 30
    curve = reliability(records)
    centre, observed, n = curve[-1]
    assert observed < centre, "should show the model is overconfident here"


def test_criteria_hash_is_stable():
    assert criteria_hash(Q) == criteria_hash(dict(reversed(list(Q.items()))))


def test_criteria_hash_changes_with_wording():
    changed = {
        "team": Choice(instructions="Which team?",
                       criteria={"a": "alpha CHANGED", "b": "beta"}),
        "urgent": Noul(instructions="This is urgent"),
    }
    assert criteria_hash(Q) != criteria_hash(changed)


def test_lock_file_round_trip(tmp_path):
    path = tmp_path / "calibration.lock"
    lock = write_lock(path, question="team", questions=Q, model="fake-1",
                      threshold=0.82, precision=0.951, coverage=0.63,
                      n_records=2000)
    assert json.loads(path.read_text()) == lock
    assert lock["criteria_hash"] == criteria_hash(Q)
