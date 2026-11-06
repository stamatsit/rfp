#!/usr/bin/env python3
"""Build a workbook and run every test that needs no person or network. Run from tools/migration-matrix.

  python tracker_tests/run_all.py --old OLD_TRACKER.xlsx
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--old", required=True, help="the tracker the workbook is built from")
    a = ap.parse_args()
    env = dict(os.environ, TRACKER_PASSWORD=os.environ.get("TRACKER_PASSWORD", "test-only"), PYTHONPATH=ROOT)
    work = tempfile.mkdtemp()
    built = os.path.join(work, "tracker.xlsx")
    steps = [
        ("build a release workbook", ["tracker_release.py", "--from", a.old, "--out", built]),
        ("matrix columns by name", ["test_client_matrix.py"]),
        ("matches the old tracker", ["tracker_tests/verify_against_old.py", built, a.old]),
        ("stress test", ["tracker_tests/stress.py", built]),
        ("damaged files refused", ["test_tracker_v1.py", built]),
    ]
    failed = []
    for name, cmd in steps:
        r = subprocess.run([sys.executable] + cmd, cwd=ROOT, env=env, capture_output=True, text=True)
        ok = r.returncode == 0
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            failed.append(name)
            print((r.stdout + r.stderr)[-1500:])
    shutil.rmtree(work, ignore_errors=True)
    print("\nRESULT:", "ALL PASS" if not failed else f"{len(failed)} FAILED: {failed}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
