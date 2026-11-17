"""Lossless WOFF2 delivery fonts. Requires fonttools[woff]; TTF masters stay intact."""
from pathlib import Path
import json
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

ROOT = Path(__file__).resolve().parents[1]
report = {}
for source in sorted((ROOT / 'src/assets/fonts').glob('*.ttf')):
    target = source.with_suffix('.woff2')
    original = TTFont(source, recalcTimestamp=False)
    original.flavor = 'woff2'
    original.save(target)
    decoded = TTFont(target, recalcTimestamp=False)
    assert original.getGlyphOrder() == decoded.getGlyphOrder()
    assert original.getBestCmap() == decoded.getBestCmap()
    assert original['hmtx'].metrics == decoded['hmtx'].metrics
    assert original['head'].unitsPerEm == decoded['head'].unitsPerEm
    assert [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in original['fvar'].axes] == [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in decoded['fvar'].axes]
    for tag in ('gvar', 'GPOS', 'GSUB'):
        if tag in original:
            assert original.getTableData(tag) == decoded.getTableData(tag), tag
    before, after = original.getGlyphSet(), decoded.getGlyphSet()
    for name in original.getGlyphOrder():
        left, right = RecordingPen(), RecordingPen()
        before[name].draw(left)
        after[name].draw(right)
        assert left.value == right.value, name
    report[source.stem] = {'ttf_bytes': source.stat().st_size, 'woff2_bytes': target.stat().st_size, 'glyphs': len(original.getGlyphOrder())}
    original.close()
    decoded.close()
print(json.dumps(report, indent=2))
