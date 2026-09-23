#!/usr/bin/env python3
"""Download a checksum-pinned public model and safely repack it for vosk-browser.

Python standard library only. Never extracts ZIP members onto the filesystem.
Run from any directory: python3 tools/prepare-vosk-model.py
"""
import gzip
import hashlib
import json
import os
from pathlib import Path
import stat
import tarfile
import tempfile
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "frontend/public/models/manifest.json"
MAX_EXPANDED = 80 * 1024 * 1024
MAX_MEMBER = 40 * 1024 * 1024


def digest(path):
    with open(path, "rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def verify_source(path, manifest):
    if path.stat().st_size != manifest["sourceBytes"]:
        raise ValueError("Model source length mismatch")
    if digest(path) != manifest["sourceSha256"]:
        raise ValueError("Model source checksum mismatch")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Model download redirects are not permitted")


def download(path, manifest):
    url = manifest["sourceUrl"]
    if url != "https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip":
        raise ValueError("Unexpected model source")
    opener = urllib.request.build_opener(NoRedirect())
    for attempt in range(3):
        try:
            started = time.monotonic()
            with opener.open(url, timeout=30) as response, open(path, "wb") as output:
                if response.status != 200:
                    raise ValueError("Model download failed")
                length = response.headers.get("Content-Length")
                if length is not None and int(length) != manifest["sourceBytes"]:
                    raise ValueError("Unexpected download length")
                count = 0
                while True:
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    count += len(chunk)
                    if count > manifest["sourceBytes"] or time.monotonic() - started > 180:
                        raise ValueError("Model download exceeded bounds")
                    output.write(chunk)
            verify_source(path, manifest)
            return
        except (OSError, ValueError):
            path.unlink(missing_ok=True)
            if attempt == 2:
                raise RuntimeError("Verified model download failed after three attempts") from None


def validate_members(archive, name):
    members = archive.infolist()
    if not members or len(members) > 256:
        raise ValueError("Unexpected ZIP entry count")
    seen = set()
    total = 0
    files = []
    for member in members:
        path = member.filename
        parts = path.rstrip("/").split("/")
        if (not path.isascii() or "\\" in path or "\x00" in path
                or len(path) > 200 or any(part in ("", ".", "..") for part in parts)
                or parts[0] != name or path.rstrip("/") in seen):
            raise ValueError("Unsafe ZIP member path")
        seen.add(path.rstrip("/"))
        kind = stat.S_IFMT(member.external_attr >> 16)
        if kind not in (0, stat.S_IFREG, stat.S_IFDIR) or member.flag_bits & 1:
            raise ValueError("ZIP links, special files and encryption are forbidden")
        if member.is_dir():
            if member.file_size != 0 or kind == stat.S_IFREG:
                raise ValueError("Invalid ZIP directory")
            continue
        if len(parts) < 2 or kind == stat.S_IFDIR:
            raise ValueError("Invalid ZIP file")
        total += member.file_size
        if not 0 <= member.file_size <= MAX_MEMBER or total > MAX_EXPANDED:
            raise ValueError("ZIP expansion exceeds bounds")
        if member.file_size > max(1, member.compress_size) * 1000:
            raise ValueError("ZIP compression ratio exceeds bounds")
        files.append(("model/" + "/".join(parts[1:]), member))
    required = {"model/am/final.mdl", "model/conf/model.conf", "model/conf/mfcc.conf",
                "model/graph/Gr.fst", "model/graph/HCLr.fst"}
    if not required.issubset({path for path, _ in files}):
        raise ValueError("Incomplete Vosk model")
    file_paths = {path for path, _ in files}
    if file_paths.intersection(directory_paths(files)):
        raise ValueError("ZIP file/directory path collision")
    return sorted(files), total


def directory_paths(files):
    # Do not rely on ZIP directory entries or implicit parents: libarchive in
    # the shipped WASM can leave implicit directories mode 000 after extraction.
    # Root first, then parents before descendants, and ALL directories before files.
    directories = {"model"}
    for path, _ in files:
        parts = path.split("/")
        directories.update("/".join(parts[:end]) for end in range(1, len(parts)))
    return sorted(directories, key=lambda path: (path.count("/"), path))


def repack(source, destination, manifest):
    verify_source(source, manifest)
    with zipfile.ZipFile(source) as archive:
        files, total = validate_members(archive, manifest["name"])
        if total != manifest["expandedBytes"]:
            raise ValueError("Unexpected expanded model size")
        # Fixed order, root, uid/gid, mode, timestamps and gzip header. ZIP CRCs
        # are checked by ZipExtFile while tarfile consumes every member.
        with open(destination, "wb") as output:
            with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0, compresslevel=9) as compressed:
                with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.USTAR_FORMAT) as tar:
                    for path in directory_paths(files):
                        info = tarfile.TarInfo(path + "/")
                        info.type = tarfile.DIRTYPE
                        info.mode = 0o755
                        info.mtime = 0
                        tar.addfile(info)
                    for path, member in files:
                        info = tarfile.TarInfo(path)
                        info.size = member.file_size
                        info.mode = 0o644
                        info.mtime = 0
                        with archive.open(member) as data:
                            tar.addfile(info, data)


def main():
    manifest = json.loads(MANIFEST.read_text())
    cache = ROOT / ".cache/vosk"
    cache.mkdir(parents=True, exist_ok=True)
    source = cache / (manifest["name"] + ".zip")
    destination = ROOT / "frontend/public" / manifest["assetUrl"].lstrip("/")
    with tempfile.TemporaryDirectory(prefix="prepare-", dir=cache) as temporary:
        temporary = Path(temporary)
        if not source.exists():
            downloaded = temporary / "source.zip"
            download(downloaded, manifest)
            os.replace(downloaded, source)
        output = temporary / "model.tar.gz"
        repack(source, output, manifest)
        checksum = digest(output)
        if checksum != manifest["assetSha256"] or output.stat().st_size != manifest["assetBytes"]:
            raise ValueError("Repacked model checksum mismatch")
        os.replace(output, destination)
    print(json.dumps({"asset": manifest["assetUrl"], "bytes": destination.stat().st_size,
                      "sha256": checksum}))


if __name__ == "__main__":
    main()
