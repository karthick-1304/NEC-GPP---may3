# Team photos

The About Us page (`src/pages/public/AboutUs.tsx`) references the following
files. Drop the JPGs straight into this folder — Vite serves `public/` at the
site root, so each one resolves to `/team/<file>`.

If a file is missing, the `<Avatar/>` component falls back to coloured
initials so the page never renders broken-image icons.

## Required files

| File                          | Person                                | Notes                                     |
| ----------------------------- | ------------------------------------- | ----------------------------------------- |
| `principal.jpg`               | Dr. K. Kalidasa Murugavel             | Principal, NEC                            |
| `kalaiselvi.jpg`              | Dr. S. Kalaiselvi                     | Associate Professor, CSE                  |
| `ponkarthikeyan.jpg`          | Ponkarthikeyan P (2212076)            | Developer                                 |
| `dinesh-ram.jpg`              | Dinesh Ram A (2212046)                | Developer                                 |
| `petchivaradhan.jpg`          | Petchivaradhan L (2212056)            | Developer                                 |
| `karan.jpg`                   | Karan S (2212047)                     | Developer                                 |

## Recommended specs

- **Format**: `.jpg` (or `.png` if you must — but rename the extension to `.jpg`
  here OR update the `img` paths in `AboutUs.tsx` to match).
- **Aspect ratio**: square (1:1). The component crops with `object-cover`, so
  rectangular sources will be centre-cropped — pre-cropping yields better
  framing.
- **Size**: 400×400 px is plenty. Larger is fine; smaller will look soft.
- **Compression**: aim for ≤80 KB per image. Tools like `squoosh.app` or
  `cwebp` (if you switch to WebP) keep these snappy on slow networks.

## How to add a new team member

1. Add the JPG to this folder.
2. Append an entry to `MENTORS` or `DEVS` in `AboutUs.tsx` with the matching
   `img: '/team/<file>.jpg'` path.

That's it — no build step or import required.
