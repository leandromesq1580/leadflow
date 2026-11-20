#!/usr/bin/env python3
"""Promote an explicitly reviewed Academy release; never recursively copy sources."""
import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
import tempfile


def safe_path(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.\-/]*', value):
        raise ValueError('invalid relative path')
    if any(part in ('', '.', '..') or part.startswith('.') for part in value.split('/')):
        raise ValueError('invalid path component')
    return value


def no_symlinks(path):
    for item in (path, *path.parents):
        if item.is_symlink():
            raise ValueError('symlinks are not allowed')


def validate(manifest, source, destination):
    fields = {'schemaVersion', 'publicationApproved', 'reviewedBy', 'reviewedAt',
              'requiredPaths', 'assets'}
    if not isinstance(manifest, dict) or set(manifest) != fields:
        raise ValueError('invalid manifest fields')
    if type(manifest['schemaVersion']) is not int or manifest['schemaVersion'] != 1:
        raise ValueError('unsupported schema')
    if manifest['publicationApproved'] is not True:
        raise ValueError('release is not approved')
    if not isinstance(manifest['reviewedBy'], str) or not manifest['reviewedBy'].strip():
        raise ValueError('reviewer required')
    if not isinstance(manifest['reviewedAt'], str) or datetime.fromisoformat(
            manifest['reviewedAt'].replace('Z', '+00:00')).tzinfo is None:
        raise ValueError('timezone-aware review timestamp required')
    required, assets = manifest['requiredPaths'], manifest['assets']
    if not isinstance(required, list) or not isinstance(assets, list):
        raise ValueError('lists required')
    required = [safe_path(p) for p in required]
    if len(set(required)) != len(required) or 'index.html' not in required:
        raise ValueError('invalid inventory')
    paths = []
    for asset in assets:
        if not isinstance(asset, dict) or set(asset) != {'path', 'source', 'sha256', 'approved'}:
            raise ValueError('invalid asset fields')
        paths.append(safe_path(asset['path']))
        safe_path(asset['source'])
        if asset['approved'] is not True:
            raise ValueError('asset is not approved')
        if not isinstance(asset['sha256'], str) or not re.fullmatch('[0-9a-f]{64}', asset['sha256']):
            raise ValueError('invalid sha256')
        no_symlinks(source / asset['source'])
        if not (source / asset['source']).is_file():
            raise ValueError('regular source file required')
    if len(paths) != len(set(paths)) or set(paths) != set(required):
        raise ValueError('release must match complete inventory')
    no_symlinks(source)
    no_symlinks(destination)
    if not source.is_dir() or not destination.parent.is_dir():
        raise ValueError('existing roots required')
    if destination.exists() or destination.is_symlink():
        raise ValueError('destination must not exist')
    if source.resolve() == destination.resolve() or source.resolve() in destination.resolve().parents:
        raise ValueError('destination must be outside source')


def stage(manifest, source, destination):
    source, destination = Path(source).absolute(), Path(destination).absolute()
    validate(manifest, source, destination)
    with tempfile.TemporaryDirectory(prefix='.academy-stage-', dir=destination.parent) as temp:
        work = Path(temp) / 'release'
        work.mkdir()
        for asset in manifest['assets']:
            data = (source / asset['source']).read_bytes()
            if hashlib.sha256(data).hexdigest() != asset['sha256']:
                raise ValueError('hash mismatch')
            target = work / asset['path']
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            if hashlib.sha256(target.read_bytes()).hexdigest() != asset['sha256']:
                raise ValueError('staged readback mismatch')
        # Fresh directory only: never merge with an earlier or mixed release.
        if destination.exists() or destination.is_symlink():
            raise ValueError('destination appeared during staging')
        work.rename(destination)
    return len(manifest['assets'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    try:
        count = stage(json.loads(args.manifest.read_text()), args.source, args.destination)
    except (ValueError, OSError, KeyError, TypeError):
        parser.exit(1, 'Academy staging rejected; check approval, paths, hashes and fresh destination.\n')
    print(f'Academy staging verified: {count} files. No deploy performed.')


if __name__ == '__main__':
    main()
