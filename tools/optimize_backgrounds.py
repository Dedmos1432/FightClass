"""Lossless delivery copies. Original artwork and its pixel dimensions remain intact."""
from pathlib import Path
from PIL import Image
import json

root = Path(__file__).resolve().parents[1]
output = root / 'assets' / 'optimized'
output.mkdir(parents=True, exist_ok=True)
sources = {
    'lobby': root / 'assets/backgrounds/lobby.png',
    'gym': root / 'resourse/задники/качалка.png',
    'dojo': root / 'resourse/задники/зал боевых искусств.png',
    'arena': root / 'resourse/задники/Подпольная арена боёв.png',
    'career-board': root / 'assets/ui/career-board.png',
}
report = {}
for name, source in sources.items():
    target = output / f'{name}.webp'
    with Image.open(source) as original:
        original.save(target, 'WEBP', lossless=True, method=6, exact=True)
        with Image.open(target) as compressed:
            assert original.size == compressed.size
            assert original.convert('RGBA').tobytes() == compressed.convert('RGBA').tobytes(), name
    report[name] = {'original_bytes': source.stat().st_size, 'delivery_bytes': target.stat().st_size}
(output / 'sizes.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
