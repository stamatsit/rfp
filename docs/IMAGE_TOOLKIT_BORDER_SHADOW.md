# Image Toolkit: white border and drop shadow

A "Border & Shadow" card in the Image Toolkit (`/convert`, and `/portal` for clients) adds a white border, a drop shadow, or both. People see the result live and dial it in before they export.

## Where the code is

- `packages/client/src/lib/imageFrame.ts`: layout math and canvas drawing, with tests in `imageFrame.test.ts`.
- `packages/client/src/components/image-toolkit/FramedPreview.tsx`: live preview and its controls.
- `packages/client/src/components/image-toolkit/BorderShadowCard.tsx`: the controls in the right panel.
- `packages/client/src/pages/ImageConverter.tsx`: holds the settings on each image and sends every export through `exportItem`.

There are no server changes.

## Rules to keep

- **Never burn the effect into `src`.** It is a setting on `ImageItem.frame`, drawn at preview and export. Crop, erase, enhance and background removal all work on the clean picture, and turning a switch off is the undo.
- **Preview and export share one code path.** Both use `computeFrameLayout` and `drawFrame`. Do not add a CSS version of the preview, because it would drift from the file.
- **With both switches off, export is the original code path.** `exportItem` calls `exportImage` unchanged.
- **Never stretch the picture.** When a border changes the shape of the space inside a fixed size, the picture is trimmed, centered, so the border stays even.

## Behavior decisions

- **File size:** with no preset the canvas grows, so nothing is cropped or resampled. With a preset (`ImageItem.fixedSize`) the file keeps its exact size and the picture shrinks inside. A toggle overrides either default. Multi-size export always keeps each named size.
- **File background behind a shadow:** transparent with no preset, white with a preset, because transparency handling on social platforms is unreliable. JPEG is always white.
- **Sizes scale with the image:** border and shadow values are a percent of the short side, so a look holds across a batch and across sizes. A typed pixel border stays exact.
- **New images:** they remember the last slider values, but their switches always start off, so nobody gets a border they did not ask for.
- **Enhance:** clears `fixedSize`, because the dimensions change. Undo restores it.

## Traps

- Canvas `shadowBlur` and shadow offsets ignore transforms, so `drawFrame` scales them by hand. Otherwise the preview would not match the file.
- Shadows are cast from a shape parked off the canvas, so only the shadow lands. Drawing a cutout once per shadow layer would harden its soft edges.
- The margin is `1.5 x blur + distance`. Canvas blur is a Gaussian with sigma = blur / 2, so the shadow reaches zero in 8-bit alpha by then and is never cut off.
- Browsers cap canvas size, and iPhones cap it low (about 16.7 megapixels, so a 12 megapixel photo with a border and shadow can go over). Past the cap many stop drawing without any error. `canvasCanDraw` proves the far corner can be drawn, and the toolkit shows a clear message instead of saving a blank file.
- A canvas refused a full-size buffer can stay broken, so the 100% view and the fit view use separate canvas elements.
- `@imgly/background-removal` output tops out at alpha 254, so a cutout never has fully opaque pixels. That comes from the library, not this feature.

## Known limits

- On a phone the preview and the controls cannot be on screen together. On desktop the preview stays pinned while the controls scroll. A floating mini preview is the likely fix if phone use matters.
- Cutouts get a white rectangle from the border, and the card says so. A sticker-style outline that hugs the subject has not been built.
- Border colors, per-side widths and rounded corners are left out on purpose.

## Existing bugs left alone

- `handleDownloadMultiSize` stretches the image to each size when the effect is off.
- The JPEG quality slider has no effect, because `resizeImage` hardcodes 0.92. Framed JPEG exports match that for consistency.
