"""Package the Yandex build with index.html at the archive root."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parents[1]
source = root / 'dist-yandex'
output = root / 'artifacts'
assert (source / 'index.html').is_file(), 'Run npm run build:yandex first'
scripts = '\n'.join(path.read_text(encoding='utf-8') for path in (source / 'assets').glob('index-*.js'))
assert '/sdk.js' in scripts, 'SDK loader is missing'
assert 'sdk.games.s3.yandex.net' not in scripts, 'Archive must use /sdk.js'
output.mkdir(exist_ok=True)
target = output / 'fight-class-yandex-0.6.0.zip'
files = sorted(path for path in source.rglob('*') if path.is_file())
unpacked = sum(path.stat().st_size for path in files)
assert unpacked <= 100_000_000, 'Unpacked game exceeds 100 MB'
assert all(path.relative_to(source).as_posix().isascii() and ' ' not in path.relative_to(source).as_posix() for path in files), 'Use ASCII filenames without spaces'
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        assert not path.is_symlink()
        archive.write(path, path.relative_to(source).as_posix())
with ZipFile(target) as archive:
    assert 'index.html' in archive.namelist()
    assert archive.testzip() is None
report = {'archive': target.name, 'files': len(files), 'bytes': target.stat().st_size, 'unpacked_bytes': unpacked,
          'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
(output / 'yandex-build.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
