"""Rebuild every generated file, in dependency order.

    python3 tools/build_all.py           # rebuild
    python3 tools/build_all.py --check   # rebuild, then fail if anything changed

--check is what `npm run check` runs: if a spec, a template or a fact was
edited without rebuilding, the committed pages are stale and this says so.
State pages are rebuilt from the data files only when their builder exists.
"""
import pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
STEPS = [
    "build_content_page.py",
    "build_state_pages.py",
    "build_hubs.py",
    "build_content_page.py",     # again: nav, footer and related links see the hubs
    "sync_shell.py",
    "stamp_scripts.py",
    "build_llms.py",
    "build_sitemap.py",
]
FIXED = ["index.html", "methodology.html", "guides.html", "states.html", "nyc.html", "about.html",
         "llms.txt", "llms-full.txt", "sitemap.xml", "data/state-pages.json", "data/states.csv"]


def generated():
    sys.path.insert(0, str(ROOT / "tools"))
    import sitelib
    files = [p["file"] for p in sitelib.manifest()]
    return [f for f in FIXED + files if (ROOT / f).exists()]


def main(argv):
    for step in STEPS:
        if not (ROOT / "tools" / step).exists():
            continue
        r = subprocess.run([sys.executable, step], cwd=ROOT / "tools", capture_output=True, text=True)
        if r.returncode:
            sys.exit(f"{step} failed:\n{r.stdout}{r.stderr}")
    if "--check" in argv:
        r = subprocess.run(["git", "status", "--porcelain", "--", *generated()], cwd=ROOT,
                           capture_output=True, text=True)
        changed = [l for l in r.stdout.splitlines() if l[:2].strip() in ("M", "A", "??", "D")]
        if changed:
            sys.exit("generated files are out of date; run tools/build_all.py and commit:\n" + "\n".join(changed))
    print("all generated files are current")


if __name__ == "__main__":
    main(sys.argv[1:])
