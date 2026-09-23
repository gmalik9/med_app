"""Offline synthetic archive regression; invoked by config-vosk-assets.test.mjs."""
import gzip
import importlib.util
from pathlib import Path, PurePosixPath
import stat
import tarfile
import tempfile
import zipfile

spec = importlib.util.spec_from_file_location("prepare", "tools/prepare-vosk-model.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
name = "vosk-model-small-en-in-0.4"
payloads = {path: ("synthetic-" + path).encode() for path in (
    "README", "am/final.mdl", "conf/model.conf", "conf/mfcc.conf",
    "graph/Gr.fst", "graph/HCLr.fst", "graph/phones/word_boundary.int")}

with tempfile.TemporaryDirectory() as temporary:
    tmp = Path(temporary)
    source = tmp / "source.zip"
    # Omit ZIP directories: the preparer must derive ALL parents.
    with zipfile.ZipFile(source, "w") as archive:
        for path, data in reversed(list(payloads.items())):
            archive.writestr(name + "/" + path, data)
    manifest = dict(name=name, sourceBytes=source.stat().st_size,
                    sourceSha256=prepare.digest(source), expandedBytes=sum(map(len, payloads.values())))
    first, second = tmp / "one.tar.gz", tmp / "two.tar.gz"
    prepare.repack(source, first, manifest)
    prepare.repack(source, second, manifest)
    assert first.read_bytes() == second.read_bytes()
    raw = gzip.decompress(first.read_bytes())
    with tarfile.open(first) as tar:
        entries, seen, file_seen = tar.getmembers(), set(), False
        assert [e.name for e in entries if e.isdir()] == [
            "model", "model/am", "model/conf", "model/graph", "model/graph/phones"]
        assert len(entries) == len(payloads) + 5
        for entry in entries:
            assert entry.isfile() or entry.isdir()
            assert (entry.uid, entry.gid, entry.mtime, entry.uname, entry.gname) == (0, 0, 0, "", "")
            assert raw[entry.offset + 257:entry.offset + 265] == b"ustar\x0000"
            assert not entry.pax_headers
            assert entry.name not in seen
            parent = str(PurePosixPath(entry.name).parent)
            assert parent == "." or parent in seen
            if entry.isdir():
                assert not file_seen and entry.mode == 0o755 and entry.size == 0
                assert raw[entry.offset:entry.offset + 100].split(b"\x00", 1)[0].endswith(b"/")
            else:
                file_seen = True
                assert entry.mode == 0o644
                assert tar.extractfile(entry).read() == payloads[entry.name.removeprefix("model/")]
            seen.add(entry.name)
        # Actual host extraction, not only a header/file-name assertion.
        tar.extractall(tmp / "extracted", filter="data")
        for entry in entries:
            path = tmp / "extracted" / entry.name
            assert stat.S_IMODE(path.stat().st_mode) == (0o755 if entry.isdir() else 0o644)
            if entry.isfile():
                assert path.read_bytes() == payloads[entry.name.removeprefix("model/")]
    with zipfile.ZipFile(source, "a") as archive:
        archive.writestr(name + "/graph", b"collision")
    with zipfile.ZipFile(source) as archive:
        try:
            prepare.validate_members(archive, name)
        except ValueError:
            pass
        else:
            raise AssertionError("file/parent collision accepted")

print("directory ordering, extraction permissions, byte preservation, determinism and collision rejection passed")
