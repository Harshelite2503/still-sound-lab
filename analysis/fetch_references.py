"""Retrieve the three explicitly bounded, public reference excerpts; no API key.

Run from the repository: python analysis/fetch_references.py
Requires the dependencies in requirements.txt and a supported JS runtime for yt-dlp.
Uses no browser cookies or private account credentials.
"""
import argparse
from pathlib import Path
import subprocess
import sys
import imageio_ffmpeg

REFERENCES = [
    ('fyGmSFUPo8o', 1968, 1998),
    ('Ttaf1IYt6F4', 60, 90),
    ('6Kj-ye-aYBA', 60, 90),
]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'samples')
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    for video_id, start, end in REFERENCES:
        command = [sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-playlist',
                   '--js-runtimes', 'node', '--socket-timeout', '20', '--retries', '1',
                   '--extractor-retries', '1', '--ffmpeg-location', ffmpeg,
                   '--downloader-args', 'ffmpeg:-loglevel error -nostats', '-f', '140',
                   '--download-sections', f'*{start}-{end}',
                   '-o', str(args.output_dir / f'{video_id}-{start}-{end}.%(ext)s'),
                   f'https://www.youtube.com/watch?v={video_id}']
        subprocess.run(command, check=True)

if __name__ == '__main__':
    main()
