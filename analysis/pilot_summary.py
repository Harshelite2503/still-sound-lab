"""Pilot go/no-go readout from participants' Still pilot summaries.

Usage:  python3 analysis/pilot_summary.py path/to/folder-of-still-pilot-*.json [--window 60] [--min-days 30]

Standard library only. Each file is one participant's "Download pilot summary" export from journal.html.
It holds day offsets from first use, never calendar dates.

Main question (decided before the pilot starts, see docs/launch-plan.md):
  Of participants followed for at least --min-days, what share used Still during 2 or more
  separate headache episodes within their first --window days?  GO if >= 40%.
"""
import argparse
import json
import statistics
import sys
from pathlib import Path

GO_THRESHOLD = 0.40


def load(folder):
    rows = []
    for path in sorted(Path(folder).glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            print(f"skipped unreadable file: {path.name}", file=sys.stderr)
            continue
        if data.get("schema") != "still-pilot-summary-v1":
            print(f"skipped non-summary file: {path.name}", file=sys.stderr)
            continue
        rows.append(data)
    # One row per participant: keep the export that covers the most days.
    best = {}
    for row in rows:
        code = row.get("participant")
        if code and (code not in best or (row.get("daysSinceFirstUse") or 0) > (best[code].get("daysSinceFirstUse") or 0)):
            best[code] = row
    return list(best.values())


def participant(row, window):
    eps = [e for e in row.get("episodes", []) if isinstance(e.get("day"), int) and 0 <= e["day"] < window]
    missed = [d for d in row.get("missedDays", []) if isinstance(d, int) and 0 <= d < window]
    follow = {k: sum(e.get("followUps", {}).get(k, 0) for e in eps) for k in ("better", "same", "worse")}
    return {
        "code": row["participant"],
        "days": row.get("daysSinceFirstUse") or 0,
        "used": len(eps),
        "missed": len(missed),
        "repeat": len(eps) >= 2,
        "listening_min": sum(e.get("listeningMin", 0) for e in eps),
        "dark_min": sum(e.get("darkScreenMin", 0) for e in eps),
        "worse_episodes": sum(1 for e in eps if e.get("worse")),
        **follow,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder")
    parser.add_argument("--window", type=int, default=60, help="days from first use to count (default 60)")
    parser.add_argument("--min-days", type=int, default=30, help="minimum follow-up to be included in the main metric (default 30)")
    args = parser.parse_args()

    people = [participant(r, args.window) for r in load(args.folder)]
    if not people:
        sys.exit("No still-pilot-summary-v1 files found.")
    eligible = [p for p in people if p["days"] >= args.min_days]

    print(f"{'code':<12}{'days':>5}{'used':>6}{'missed':>8}{'repeat':>8}{'sound min':>11}{'dark min':>10}{'better':>8}{'same':>6}{'worse':>7}")
    for p in sorted(people, key=lambda p: p["code"]):
        print(f"{p['code']:<12}{p['days']:>5}{p['used']:>6}{p['missed']:>8}{'yes' if p['repeat'] else 'no':>8}"
              f"{p['listening_min']:>11.1f}{p['dark_min']:>10.1f}{p['better']:>8}{p['same']:>6}{p['worse']:>7}")

    print()
    print(f"Participants: {len(people)} · followed >= {args.min_days} days: {len(eligible)}")
    if eligible:
        share = sum(p["repeat"] for p in eligible) / len(eligible)
        used = sum(p["used"] for p in eligible)
        missed = sum(p["missed"] for p in eligible)
        print(f"Main metric: {share:.0%} used Still in 2+ separate episodes within {args.window} days "
              f"(threshold {GO_THRESHOLD:.0%}) -> {'GO' if share >= GO_THRESHOLD else 'NOT YET'}")
        if used + missed:
            print(f"Share of noted headaches where Still was opened: {used / (used + missed):.0%} ({used} of {used + missed})")
        print(f"Median episodes per person: {statistics.median(p['used'] for p in eligible)}")
        harmed = sum(1 for p in eligible if p["worse_episodes"])
        print(f"People with at least one 'made it worse' episode: {harmed} of {len(eligible)} (safety signal: review each one)")
    print("\nReminder: 'felt better afterwards' is not evidence that the sound caused it.")


if __name__ == "__main__":
    main()
