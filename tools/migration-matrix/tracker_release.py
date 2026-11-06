#!/usr/bin/env python3
"""Build a Migration Tracker workbook with real stored results, ready to hand to the team.

  TRACKER_PASSWORD=... tracker_release.py --from OLD.xlsx --out NEW.xlsx [--matrix-link "Project=URL"]

Builds once, has LibreOffice calculate every formula, then builds again with those
results stored. Excel recalculates on open anyway; the stored results are for readers
that never recalculate, like the sync. Stops if any formula comes out as an error.
Needs LibreOffice (soffice) on the path.
"""
import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile

from openpyxl import load_workbook

import build_tracker_workbook as builder

EPOCH = dt.datetime(1899, 12, 30)


def calculate(path, workdir):
    """Path of a copy with every formula calculated."""
    out = os.path.join(workdir, "calculated")
    subprocess.run(["soffice", "--headless", "--norestore", f"-env:UserInstallation=file://{workdir}/profile",
                    "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", out, path],
                   check=True, capture_output=True, timeout=300)
    return os.path.join(out, os.path.basename(path))


def stored_results(source, calculated):
    """{'Sheet!A1': value} for every formula, and the formula errors found."""
    formulas = load_workbook(source, data_only=False)
    values = load_workbook(calculated, data_only=True)
    results, errors = {}, []
    for ws in formulas.worksheets:
        got = values[ws.title]
        for row in ws.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    v = got[cell.coordinate].value
                    if isinstance(v, str) and v.startswith("#"):
                        errors.append(f"{ws.title}!{cell.coordinate}={v}")
                    if isinstance(v, dt.datetime):
                        v = (v - EPOCH).total_seconds() / 86400
                    elif isinstance(v, dt.date):
                        v = (dt.datetime(v.year, v.month, v.day) - EPOCH).days
                    results[f"{ws.title}!{cell.coordinate}"] = "" if v is None else v
    return results, errors


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from", dest="old", required=True, help="the tracker to carry data from")
    ap.add_argument("--out", required=True)
    ap.add_argument("--matrix-link", action="append", default=[], help="Project=URL. Never logged.")
    a = ap.parse_args()
    password = os.environ.get("TRACKER_PASSWORD", "")
    if not password:
        sys.exit("Set TRACKER_PASSWORD. It is never stored in this repo.")
    links = dict(x.split("=", 1) for x in a.matrix_link)
    with tempfile.TemporaryDirectory() as work:
        first = os.path.join(work, "first.xlsx")
        builder.build(a.old, first, {}, links, password)
        results, errors = stored_results(first, calculate(first, work))
        if errors:
            sys.exit(f"{len(errors)} formula errors, for example {errors[:5]}")
        tmp = a.out + ".building"
        team, projects, rows = builder.build(a.old, tmp, results, links, password)
        shutil.move(tmp, a.out)   # all at once, so nothing can read a half-written file
    print(f"built {a.out}: {len(team)} people, {len(projects)} projects, {len(rows)} assignment rows, "
          f"{len(results)} formulas, 0 errors")


if __name__ == "__main__":
    main()
