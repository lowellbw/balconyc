"""Merge researched state entries into data/state-status.json.

    python3 tools/import_state_research.py RESEARCH.json [MORE.json ...] [--reviewed YYYY-MM-DD]

Each research file is an object keyed by USPS code, in the shape the
research brief asks for (status, summary, bills, dates, cap, certification,
export_compensation, grants_right_to_install, notes, sources, confidence).
Entries replace the existing ones for those states; everything else is kept.
The review date defaults to today and is what the staleness tests count from.

Nothing is imported without a source: an entry whose status is not
"unknown" must carry at least one https source, and an enacted or passed law
at least one marked primary. The data tests enforce the same rules.
"""
import datetime, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGET = ROOT / "data" / "state-status.json"
FIELDS = ["name", "status", "summary", "bills", "signed_date", "effective_date", "ac_limit_watts",
          "certification", "export_compensation", "grants_right_to_install", "notes", "sources",
          "confidence"]


def main(argv):
    reviewed = datetime.date.today().isoformat()
    if "--reviewed" in argv:
        i = argv.index("--reviewed")
        reviewed = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    doc = json.loads(TARGET.read_text(encoding="utf-8"))
    enum = set(doc["status_enum"])
    changed = []
    for path in argv:
        research = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        research = research.get("states", research)
        for code, entry in research.items():
            if code not in doc["states"]:
                sys.exit(f"{path}: unknown state {code}")
            if entry.get("status") not in enum:
                sys.exit(f"{path}: {code} has status {entry.get('status')!r}")
            srcs = entry.get("sources") or []
            if entry["status"] != "unknown":
                if not srcs or not all(s["url"].startswith("https://") for s in srcs):
                    sys.exit(f"{path}: {code} needs https sources")
                if entry["status"] in ("in_force", "enacted_not_yet_effective", "passed_awaiting_signature") \
                        and not any(s.get("primary") for s in srcs):
                    sys.exit(f"{path}: {code} ({entry['status']}) needs a primary source")
            merged = {k: entry.get(k) for k in FIELDS}
            merged["name"] = merged["name"] or doc["states"][code]["name"]
            merged["reviewed"] = reviewed
            doc["states"][code] = merged
            changed.append(code)
    doc["updated"] = reviewed
    TARGET.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {}
    for s in doc["states"].values():
        counts[s["status"]] = counts.get(s["status"], 0) + 1
    print(f"imported {len(changed)}: {' '.join(sorted(changed))}")
    print("now:", ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))


if __name__ == "__main__":
    main(sys.argv[1:])
