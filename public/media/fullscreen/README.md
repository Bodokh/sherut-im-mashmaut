# Fullscreen story image masters

These versioned assets are used by the homepage Manifesto panels and Support image. Smaller
images used by other pages and the film thumbnail remain separate. Next Image
serves responsive derivatives at quality 85 for Manifesto and quality 75 for
Support; these master file sizes are not the normal transfer size for a phone
or laptop.

| Asset | Native dimensions | Master bytes | Source and processing |
| --- | --- | --- | --- |
| `choice.c05e5f894977.webp` | 1672 × 941 | 1,421,754 | Lossless WebP from the existing approved, watermark-free reconstructed film PNG. No enlargement or new generation. |
| `meaning.2b2449ec567f.webp` | 4608 × 2592 | 2,584,250 | Original Unsplash photograph, cropped centrally to match the existing 16:9 composition, then WebP quality 90. |
| `support.d53ef65fa304.webp` | 5472 × 3648 | 2,058,398 | Original Unsplash photograph, full composition, then WebP quality 90. |
| `lecture.d5fda8dfbadc.webp` | 2048 × 1536 | 418,314 | Client lecture photograph, encoded as WebP quality 90 at its original 2048 × 1536 resolution. No enlargement. Dedicated to the homepage Support section. |

Original photographs:

- Mountain: [original image](https://images.unsplash.com/photo-1500964757637-c85e8a162699?auto=format&fit=max&q=90), 4608 × 2963. The crop removes 186 pixels above and 185 below.
- Support: [original image](https://images.unsplash.com/photo-1551847677-dc82d764e1eb?auto=format&fit=max&q=90), 5472 × 3648.
- Lecture: organisation photograph of a speaker addressing a full hall, 2048 × 1536. The homepage Support frame uses `object-position: 45% 56%`, so a 1280 × 592 desktop crop shows roughly source rows y 330–1277 and keeps the speaker and front rows above the overlapping text card.

The original photographs were recovered directly. No AI reconstruction or
upsampling was applied to either photograph. The Choice image retains its
actual 1672-pixel source resolution.

Responsive `sizes` accounts for `object-fit: cover` on tall displays. A 2560px
Next Image width fills the gap between 2048 and 3840, so suitable devices avoid
jumping directly to the largest derivative. Other components retain quality 75.
