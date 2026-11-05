"""Download the best available audio stream for each song in a sources manifest, unchanged.

    .venv/bin/python analysis/fetch_song_set.py --manifest data/song-dna/kishore-kumar-sources.json \
        --output-dir ~/Desktop/songs/Kishore_Kumar_youtube

Keeps YouTube's original audio stream (usually Opus in WebM, otherwise AAC in M4A) without
re-encoding, so no quality is lost in the download itself. No cookies or account credentials are
used. Downloaded audio is for local analysis only: keep it outside the repository.
"""
import argparse
import json
import pathlib
import subprocess
import sys

import imageio_ffmpeg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', required=True, type=pathlib.Path)
    ap.add_argument('--output-dir', required=True, type=pathlib.Path)
    args = ap.parse_args()
    out = args.output_dir.expanduser()
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(args.manifest.read_text())
    failed = []
    for i, song in enumerate(manifest['songs'], 1):
        name = f"{i:02d} {song['title']}"
        cmd = [sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-playlist', '--js-runtimes', 'node',
               '--socket-timeout', '30', '--retries', '3', '--ffmpeg-location', imageio_ffmpeg.get_ffmpeg_exe(),
               '-f', 'bestaudio[acodec=opus]/bestaudio', '--no-part', '--write-info-json', '--no-write-comments',
               '-o', str(out / f'{name}.%(ext)s'), f"https://www.youtube.com/watch?v={song['id']}"]
        print(f'[{i}/{len(manifest["songs"])}] {song["title"]} ({song["id"]})', flush=True)
        if subprocess.run(cmd).returncode:
            failed.append(song['title'])
    if failed:
        print('Failed:', ', '.join(failed))
        sys.exit(1)


if __name__ == '__main__':
    main()
