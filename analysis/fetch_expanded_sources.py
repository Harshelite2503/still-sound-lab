"""Fetch the inspected EmoSynth release and optional exact birdsong-study files.

Standard library only; no API key. Example:
  python analysis/fetch_expanded_sources.py --output-dir work/datasets
  python analysis/fetch_expanded_sources.py --output-dir work/datasets \
      --birdsong-manifest data/expanded-sources/birdsong-manifest.json

EmoSynth is CC BY 4.0, DOI 10.5281/zenodo.3727593. Its corrected archive
contains 168 labelled WAVs although the paper/landing page describe 144.
Optional OSF study audio has no verified redistribution license: retain it
locally for analysis. Downloading it does not grant redistribution rights.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath
import argparse
import csv
import hashlib
import json
import re
import shutil
import time
import urllib.parse
import urllib.request
import zipfile

EMOSYNTH_URL = 'https://zenodo.org/api/records/3727593/files/emoSynth-DB-fix.zip/content'
EMOSYNTH_BYTES = 103356254
EMOSYNTH_MD5 = '98074685b39793ccb2b18b29e85f47d8'
CHUNK = 4 * 1024 * 1024


def digest(path, algorithm):
    value = hashlib.new(algorithm)
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def fetch_emosynth(output_dir, workers=8):
    folder = output_dir / 'emosynth'
    folder.mkdir(parents=True, exist_ok=True)
    archive = folder / 'emoSynth-DB-fix.zip'
    verified = archive.exists() and archive.stat().st_size == EMOSYNTH_BYTES and digest(archive, 'md5') == EMOSYNTH_MD5
    if not verified:
        parts_dir = folder / '.download-parts'
        parts_dir.mkdir(exist_ok=True)

        def download_part(start):
            end = min(start + CHUNK, EMOSYNTH_BYTES) - 1
            part = parts_dir / f'{start:09d}.part'
            temporary = part.with_suffix('.tmp')
            if part.exists() and part.stat().st_size == end - start + 1:
                return part
            for attempt in range(4):
                try:
                    received = temporary.stat().st_size if temporary.exists() else 0
                    if received > end - start + 1:
                        raise RuntimeError('Oversized temporary range; remove .download-parts before retrying')
                    if received == end - start + 1:
                        temporary.replace(part)
                        return part
                    resume_start = start + received
                    request = urllib.request.Request(EMOSYNTH_URL, headers={'Range': f'bytes={resume_start}-{end}'})
                    with urllib.request.urlopen(request, timeout=180) as response:
                        expected = f'bytes {resume_start}-{end}/{EMOSYNTH_BYTES}'
                        if response.status != 206 or response.headers.get('Content-Range') != expected:
                            raise RuntimeError('Server did not return the requested byte range')
                        with temporary.open('ab') as destination:
                            while block := response.read(64 * 1024):
                                destination.write(block)
                    if temporary.stat().st_size != end - start + 1:
                        raise RuntimeError('Incomplete or oversized range')
                    temporary.replace(part)
                    print(f'EmoSynth: received bytes {start}–{end}', flush=True)
                    return part
                except Exception:
                    if attempt == 3:
                        raise
                    time.sleep(2 ** attempt)

        with ThreadPoolExecutor(max_workers=workers) as pool:
            parts = list(pool.map(download_part, range(0, EMOSYNTH_BYTES, CHUNK)))
        temporary = folder / 'archive.download'
        with temporary.open('wb') as destination:
            for part in parts:
                with part.open('rb') as source:
                    shutil.copyfileobj(source, destination)
        if temporary.stat().st_size != EMOSYNTH_BYTES or digest(temporary, 'md5') != EMOSYNTH_MD5:
            raise RuntimeError('EmoSynth checksum mismatch. Remove .download-parts before retrying.')
        temporary.replace(archive)

    with zipfile.ZipFile(archive) as source:
        bad = source.testzip()
        if bad is not None:
            raise RuntimeError(f'Archive CRC check failed: {bad}')
        selected = []
        for item in source.infolist():
            path = PurePosixPath(item.filename)
            if path.is_absolute() or '..' in path.parts:
                raise RuntimeError('Unsafe archive path')
            if item.filename in ('emoSynth-DB/all_data/readme.txt', 'emoSynth-DB/all_data/audio_labels.csv') or re.fullmatch(r'emoSynth-DB/all_data/wavs/(?:s|sq|sw)\d+_a[01]_d[12]\.wav', item.filename):
                selected.append(item)
        if sum(item.filename.endswith('.wav') for item in selected) != 168:
            raise RuntimeError('Unexpected audio-file count for pinned release')
        for item in selected:
            destination = folder / item.filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            with source.open(item) as input_file, destination.open('wb') as output_file:
                shutil.copyfileobj(input_file, output_file)
    data = folder / 'emoSynth-DB' / 'all_data'
    with (data / 'audio_labels.csv').open(newline='') as stream:
        labels = list(csv.DictReader(stream))
    actual = {path.name for path in (data / 'wavs').glob('*.wav')}
    if len(labels) != 168 or {row['audio_file'] for row in labels} != actual:
        raise RuntimeError('Audio and aggregate-label rows do not match')
    print(f'Verified 168 EmoSynth WAVs and matching aggregate labels: {data}', flush=True)


def fetch_birdsong(manifest_path, output_dir):
    manifest = json.loads(manifest_path.read_text())
    folder = output_dir / 'birdsong'
    folder.mkdir(parents=True, exist_ok=True)
    metadata_url = manifest['source_api']
    metadata_parts = urllib.parse.urlparse(metadata_url)
    if metadata_parts.scheme != 'https' or metadata_parts.hostname != 'api.osf.io':
        raise ValueError('Expected the public OSF metadata API')
    with urllib.request.urlopen(metadata_url, timeout=90) as response:
        metadata = json.load(response)
    if not isinstance(metadata.get('data'), list):
        raise ValueError('Unexpected OSF file metadata')
    (folder / 'files.json').write_text(json.dumps(metadata, indent=2))
    (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    for item in manifest['files']:
        name, url, checksum = item['local_file'], item['download_url'], item['expected_sha256']
        parsed = urllib.parse.urlparse(url)
        if Path(name).name != name or parsed.scheme != 'https' or parsed.hostname != 'osf.io' or not re.fullmatch('[0-9a-f]{64}', checksum):
            raise ValueError('Invalid OSF stimulus metadata')
        target = folder / name
        if target.exists() and digest(target, 'sha256') == checksum:
            continue
        temporary = target.with_suffix('.download')
        with urllib.request.urlopen(url, timeout=180) as response, temporary.open('wb') as destination:
            shutil.copyfileobj(response, destination)
        if digest(temporary, 'sha256') != checksum:
            raise RuntimeError(f'Checksum mismatch for {name}')
        temporary.replace(target)
    print(f'OSF study audio verified for local analysis only: {folder}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--output-dir', type=Path, default=Path('work/datasets'))
    parser.add_argument('--workers', type=int, choices=range(1, 9), default=8)
    parser.add_argument('--birdsong-manifest', type=Path, help='Optional saved OSF stimulus manifest, including URLs and SHA-256 values')
    args = parser.parse_args()
    fetch_emosynth(args.output_dir, args.workers)
    if args.birdsong_manifest:
        fetch_birdsong(args.birdsong_manifest, args.output_dir)


if __name__ == '__main__':
    main()
