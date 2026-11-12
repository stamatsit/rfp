#!/usr/bin/env python3
"""Matrix initials resolve to the right person, and anything doubtful is left unmatched, never guessed.

Run: test_initials.py  (no files needed)
"""
import sys

from make_present import resolve_initials

ROSTER = ["Amanda", "Brian", "Jack", "Jeff", "Katie", "Kelly H", "Kelly O", "Kelly OF", "Leslie"]
# As the Team tab gives them on 11/12: Amanda AG, Katie KE, Kelly O KO, Kelly OF KOF; Kelly H and Jeff blank
WRITTEN = {"AG": "Amanda", "BM": "Brian", "KE": "Katie", "KO": "Kelly O", "KOF": "Kelly OF"}
CASES = [
    ("KE", "Katie", "written-down initials win"),
    ("KH", "Kelly H", "Katie's initials are written down, so KH can only be Kelly H"),
    ("AD", None, "Amanda is AG, so AD is someone else, not a guess at Amanda"),
    ("JF", None, "Jack and Jeff both fit, so JF stays unmatched"),
    ("LS", "Leslie", "only one roster name fits"),
    ("", None, "blank initials are nobody"),
]
fails = []
for ini, want, why in CASES:
    got = resolve_initials(ini, ROSTER, WRITTEN)
    print(("PASS " if got == want else "FAIL ") + f"{ini or 'blank'} -> {got}: {why}")
    if got != want:
        fails.append(ini)
print("RESULT:", "ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
