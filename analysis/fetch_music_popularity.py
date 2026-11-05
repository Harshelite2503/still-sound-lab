#!/usr/bin/env python3
"""Download the authors' research archives and extract only analysis inputs.

The upstream distribution is research-purpose, not an identified commercial license.
No lyrics or recordings are extracted. Existing files are hash-checked before reuse.
"""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    manifest_path = Path(__file__).resolve().parents[1] / "data/music-popularity-sources.json"
    manifest = json.loads(manifest_path.read_text())
    args.output_dir.mkdir(parents=True, exist_ok=True)
    allowed = {"musicoset_metadata/songs.csv", "musicoset_popularity/song_chart.csv",
               "musicoset_songfeatures/acoustic_features.csv"}
    for source in manifest["archives"]:
        archive = args.output_dir / source["filename"]
        if not archive.exists():
            request = urllib.request.Request(source["source_url"], headers={"User-Agent": "StillResearch/1.0"})
            with urllib.request.urlopen(request, timeout=120) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != source["sha256"]:
                raise ValueError(f"Source checksum changed: {source['filename']}; audit upstream before reuse")
            archive.write_bytes(data)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError(f"Invalid cached archive: {archive}")
        with zipfile.ZipFile(archive) as z:
            for member in z.namelist():
                normalized = member.removeprefix("./")
                if normalized not in allowed:
                    continue
                target = args.output_dir / normalized
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(member))
                print(f"Extracted {normalized}")
    missing = [name for name in allowed if not (args.output_dir / name).exists()]
    if missing:
        raise ValueError(f"Expected source members missing: {missing}")


if __name__ == "__main__":
    main()
