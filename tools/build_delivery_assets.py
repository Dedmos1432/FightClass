"""Build lossless runtime copies without modifying any authoring artwork.

Run from the repository root: python tools/build_delivery_assets.py
Requires Pillow with WebP support. Every delivered pixel is checked against its
current PNG source. No scaling, quantization, frame sampling or color conversion
beyond decoding the existing files to RGBA is performed.
"""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/delivery'
LIMIT = 2048
PADDING = 2
PORTRAITS = {
    'kim': 'kim dong won', 'kwon': 'kwon tae-young', 'yeo': 'yeo eun-sol',
    'shim': 'shim ha-min', 'bang': 'bang jung-eum', 'jang': 'chun-soo jang',
    'cha': 'cha so-wol', 'young': 'young woong', 'sunny': 'sunny jaa',
    'lee': 'ja-kyung lee', 'yang': 'ki-hoon yang', 'maria': 'maria',
}


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def save_exact(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, 'WEBP', lossless=True, method=6, exact=True)
    with Image.open(path) as decoded:
        assert decoded.size == image.size, path
        assert decoded.convert('RGBA').tobytes() == image.tobytes(), path


def rgba(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert('RGBA')


def frame_sources(group: str) -> list[tuple[str, Path]]:
    if group == 'exploration':
        return [(f'player-{state}-{direction}-{index:02}', ROOT / f'resourse/player/{state}/{state}_{direction}/{state}_{direction}_{index:02}.png')
                for state in ('idle', 'walk') for direction in ('left', 'right') for index in range(1, 9)]
    base = ROOT / 'resourse/assets/gym'
    items = [('gym-bench', base / 'bench_press_front_scaled.png')]
    for directory in ('with_bench', 'get_up', 'press'):
        for source in sorted((base / directory).glob('*.png')):
            if directory == 'press' and int(source.stem.split('_')[-1]) % 2:
                continue
            items.append((f'gym-{source.stem}', source))
    return items


def build_portraits(manifest: dict) -> dict:
    sources = {'player': ROOT / 'resourse/player/ilde_fight/combat_idle_left/idle_01.png'}
    sources.update({skin: ROOT / f'resourse/enemy/{folder}/idle/idle_right/idle_00.png' for skin, folder in PORTRAITS.items()})
    summary = {'source_bytes': 0, 'delivery_bytes': 0, 'images': 0}
    manifest['portraits'] = {}
    for skin, source in sources.items():
        target = OUT / 'portraits' / f'{skin}.webp'
        # Portrait/menu CSS depends on the original untrimmed canvas dimensions.
        save_exact(rgba(source), target)
        manifest['portraits'][skin] = target.relative_to(OUT).as_posix()
        summary['source_bytes'] += source.stat().st_size
        summary['delivery_bytes'] += target.stat().st_size
        summary['images'] += 1
    return summary


def build() -> None:
    manifest: dict = {'groups': {'exploration': [], 'gym': []}, 'frames': {}, 'pages': {}, 'portraits': {}}
    report: dict = {'lossless': True, 'groups': {}}

    # Retain the existing combat atlas pixels and coordinates. Cropping only the
    # unused bottom/right edge is safe for every existing frame and body anchor.
    combat_source = ROOT / 'public/combat'
    combat_files = sorted(combat_source.glob('*.png'))
    assert combat_files, 'Original combat atlases are missing'
    combat = {'source_bytes': 0, 'delivery_bytes': 0, 'rgba_before': 0, 'rgba_after': 0, 'source_images': 0, 'delivery_images': 0, 'frames': 0}
    for source in combat_files:
        data = json.loads(source.with_suffix('.json').read_text(encoding='utf-8'))
        image = rgba(source)
        frame_list = [value['frame'] for value in data['frames'].values()]
        width = max(frame['x'] + frame['w'] for frame in frame_list)
        height = max(frame['y'] + frame['h'] for frame in frame_list)
        assert width <= image.width and height <= image.height
        cropped = image.crop((0, 0, width, height))
        image_path = OUT / 'combat' / source.with_suffix('.webp').name
        data_path = image_path.with_suffix('.json')
        save_exact(cropped, image_path)
        data['meta']['image'] = image_path.name
        data['meta']['size'] = {'w': width, 'h': height}
        write_json(data_path, data)
        manifest['pages'][source.stem] = {'image': image_path.relative_to(OUT).as_posix(), 'data': data_path.relative_to(OUT).as_posix()}
        combat['source_bytes'] += source.stat().st_size + source.with_suffix('.json').stat().st_size
        combat['delivery_bytes'] += image_path.stat().st_size + data_path.stat().st_size
        combat['rgba_before'] += image.width * image.height * 4
        combat['rgba_after'] += width * height * 4
        combat['source_images'] += 1
        combat['delivery_images'] += 1
        combat['frames'] += len(frame_list)
    report['groups']['combat'] = combat
    print('combat', json.dumps(combat), flush=True)

    for group in ('exploration', 'gym'):
        sources = frame_sources(group)
        prepared = []
        summary = {'source_bytes': 0, 'delivery_bytes': 0, 'rgba_before': 0, 'rgba_after': 0, 'source_images': len(sources), 'delivery_images': 0, 'frames': len(sources)}
        for key, source in sources:
            image = rgba(source)
            box = image.getbbox()
            assert box, f'Empty source frame: {source}'
            cropped = image.crop(box)
            assert cropped.width <= LIMIT and cropped.height <= LIMIT, source
            # Require exact RGBA restoration, including transparent pixels. If an
            # artist puts hidden RGB in transparent margins, retain those margins.
            restored = Image.new('RGBA', image.size)
            restored.paste(cropped, box)
            if restored.tobytes() != image.tobytes():
                box = (0, 0, image.width, image.height)
                cropped = image
            prepared.append((key, source, image.size, box, cropped))
            summary['source_bytes'] += source.stat().st_size
            summary['rgba_before'] += image.width * image.height * 4

        # Height-sorted shelves give reproducible pages without rotated frames.
        prepared.sort(key=lambda item: (-item[4].height, -item[4].width, item[0]))
        page = Image.new('RGBA', (LIMIT, LIMIT))
        entries: dict = {}
        placements = []
        x = y = row_height = max_x = max_y = page_index = 0

        def flush() -> None:
            nonlocal page_index
            if not entries:
                return
            name = f'{group}-atlas-{page_index}'
            image_path = OUT / group / f'{name}.webp'
            data_path = image_path.with_suffix('.json')
            save_exact(page.crop((0, 0, max_x, max_y)), image_path)
            write_json(data_path, {'frames': entries, 'meta': {'image': image_path.name, 'size': {'w': max_x, 'h': max_y}, 'scale': '1'}})
            # Round-trip each trim through the delivered atlas, including the
            # original canvas size, so pivots and animation geometry stay intact.
            delivered = rgba(image_path)
            for key, source, original_size, box, position in placements:
                frame = entries[key]['frame']
                fragment = delivered.crop((position[0], position[1], position[0] + frame['w'], position[1] + frame['h']))
                restored = Image.new('RGBA', original_size)
                restored.paste(fragment, box)
                assert restored.tobytes() == rgba(source).tobytes(), source
                manifest['frames'][key] = name
            manifest['groups'][group].append(name)
            manifest['pages'][name] = {'image': image_path.relative_to(OUT).as_posix(), 'data': data_path.relative_to(OUT).as_posix()}
            summary['delivery_bytes'] += image_path.stat().st_size + data_path.stat().st_size
            summary['rgba_after'] += max_x * max_y * 4
            summary['delivery_images'] += 1
            page_index += 1

        for key, source, original_size, box, cropped in prepared:
            width, height = cropped.size
            if x + width > LIMIT:
                x = 0
                y += row_height + PADDING
                row_height = 0
            if y + height > LIMIT:
                flush()
                page = Image.new('RGBA', (LIMIT, LIMIT))
                entries = {}
                placements = []
                x = y = row_height = max_x = max_y = 0
            page.paste(cropped, (x, y))
            entries[key] = {
                'frame': {'x': x, 'y': y, 'w': width, 'h': height}, 'rotated': False,
                'trimmed': box != (0, 0, *original_size),
                'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': width, 'h': height},
                'sourceSize': {'w': original_size[0], 'h': original_size[1]},
            }
            placements.append((key, source, original_size, box, (x, y)))
            max_x = max(max_x, x + width)
            max_y = max(max_y, y + height)
            row_height = max(row_height, height)
            x += width + PADDING
        flush()
        report['groups'][group] = summary
        print(group, json.dumps(summary), flush=True)

    portraits = build_portraits(manifest)
    report['groups']['portraits'] = portraits
    print('portraits', json.dumps(portraits), flush=True)
    report['source_bytes'] = sum(group['source_bytes'] for group in report['groups'].values())
    report['delivery_bytes'] = sum(group['delivery_bytes'] for group in report['groups'].values())
    write_json(OUT / 'sizes.json', report)
    write_json(ROOT / 'src/assets/deliveryManifest.json', manifest)
    print('TOTAL', json.dumps({key: value for key, value in report.items() if key != 'groups'}), flush=True)


if __name__ == '__main__':
    build()
