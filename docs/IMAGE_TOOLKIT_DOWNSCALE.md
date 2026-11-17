# Image Toolkit: clean downscaling of very large photos

Card: https://app.basecamp.com/3126662/buckets/10022314/card_tables/cards/10518201902

Shipped 2026-11-17. Client only, no server changes.

## The problem

Shrinking an 8k to 11k px photo to 1920x822 or 655x368 in one go came out grainy. Resizing
to 4k first, re-uploading, then resizing again came out clean.

## Cause

`cropToDataURL`, `resizeImage` and `convertToWebP` in `pages/ImageConverter.tsx` called
`drawImage` with the browser's default smoothing. That reads only a few source pixels per
output pixel, so past roughly a 2x reduction it skips pixels and samples noise instead of
averaging it. It is the size of the jump that matters, not the starting dimensions: the same
8192 px source was far worse at 12.5x than at 4.3x.

## The fix

`packages/client/src/lib/downscale.ts` (tests in `downscale.test.ts`):

- `downscaleSteps` plans halvings so no single draw shrinks either side by more than 2x.
- `shrinkSource` runs them on working canvases, each at smoothing quality "high", and frees
  each canvas as soon as the next has been drawn from it.
- `drawDownscaled` does that and then the final draw.

The three functions above now draw through it, and `renderFrameToBlob` in `imageFrame.ts`
pre-shrinks the same way so a bordered export is as clean as a plain one. `canvasCanDraw`
moved into `downscale.ts` and is re-exported from `imageFrame.ts`.

A reduction of 2x or less, same size, or an enlargement is still a single draw.

## Rules to keep

- **A step the browser cannot hold is skipped, never fatal.** iPhones cap canvas size low and
  fail silently. The worst case is the old single draw, not a blank file.
- **Do not replace this with only `imageSmoothingQuality = "high"`.** That fixed it in Chrome,
  but browsers are free to ignore it. The stepping is what makes the result the same everywhere.

## Measured (Chrome 157, both Coe department photos, 8192x5464)

RMSE against a Lanczos resize of the same crop, 0 to 255 scale, lower is closer.
"After" is the PNG downloaded from the real toolkit UI.

| Case | Before | Manual 4k two step | After |
|---|---|---|---|
| Clean photo to 1920x822 | 2.31 | 2.17 | 1.73 |
| Clean photo to 655x368 | 4.87 | 2.17 | 1.60 |
| Grainy photo to 1920x822 | 4.57 | 2.89 | 2.43 |
| Grainy photo to 655x368 | 9.38 | 3.50 | 2.67 |

Plain resize with no crop (655x437): 1.40. Bordered export, picture area: 1.39.

## Not done

- **Sharpness.** Every canvas method is softer than Lanczos. A real resampler (a library such
  as pica) is a separate decision.
- **Safari, Firefox and a real iPhone are untested.** Chrome only.
- The live preview still draws in one pass at "high". Layout is identical to the export; only
  the resampling differs.
- ESLint could not be run: it is not installed in this repo's `node_modules`.
