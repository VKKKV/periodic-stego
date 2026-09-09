"""Generate synthetic PNG/JPEG fixtures and an independent NumPy oracle."""
from pathlib import Path
import json
import sys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from periodic_stego.synthetic import periodic_sample


def main():
    target = ROOT / 'web' / 'tests' / 'fixtures'
    target.mkdir(parents=True, exist_ok=True)
    for kind in ('vertical', 'horizontal', 'both'):
        Image.fromarray(periodic_sample(width=256, height=192, period=16, orientation=kind, seed=7)).save(target / f'{kind}.png')
    rng = np.random.default_rng(42)
    noise = np.clip(rng.normal(128, 25, (192, 256)), 0, 255).astype(np.uint8)
    Image.fromarray(noise).save(target / 'noise.png')
    Image.fromarray(np.full((80, 96), 128, dtype=np.uint8)).save(target / 'constant.png')
    Image.fromarray(periodic_sample(width=255, height=191, period=16, seed=9)).save(target / 'odd.png')
    rgb = np.stack([periodic_sample(width=256, height=192, period=16, seed=7), noise, np.full_like(noise, 128)], axis=-1)
    Image.fromarray(rgb).save(target / 'rgb.png')
    Image.fromarray(rgb).save(target / 'rgb.jpg', quality=88)
    Image.fromarray(periodic_sample(width=1024, height=1024, period=32, seed=7)).save(target / 'large.png')
    yy, xx = np.indices((7, 9))
    rgba = np.stack([(xx*19+yy*13)%256, (xx*7+yy*23)%256, (xx*31+yy*3)%256, np.full_like(xx,255)], axis=-1).astype(np.uint8)
    gray = (rgba[...,0]*0.2126 + rgba[...,1]*0.7152 + rgba[...,2]*0.0722) / 255
    work = gray-gray.mean()
    spectrum = np.fft.fft2(work)
    power = np.fft.fftshift(np.abs(spectrum)**2)
    ac = np.fft.fftshift(np.fft.ifft2(np.abs(spectrum)**2).real)
    ac /= ac[3,4]
    oracle = dict(width=9,height=7,rgba=rgba.ravel().tolist(),preprocessed=work.ravel().tolist(),power=power.ravel().tolist(),autocorrelation=ac.ravel().tolist(),fftX=power.mean(axis=0).tolist(),fftY=power.mean(axis=1).tolist())
    (target / 'numpy-reference.json').write_text(json.dumps(oracle, indent=2)+'\n')
    print(f'Generated deterministic synthetic image fixtures and NumPy oracle in {target}')


if __name__ == '__main__':
    main()
