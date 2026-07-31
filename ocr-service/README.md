# OCR service (EasyOCR on Modal)

A single Modal web endpoint that runs EasyOCR on one image and returns
`{ lines: [{ text, confidence, bbox }] }`. Called by
`backend/src/services/ocr/easyocrProvider.js` when `OCR_PROVIDER=easyocr`.
See `CLAUDE.md` and `BACKLOG.md` item 2 for why this exists (Tesseract
replacement) and why Modal (hosting decision, item 12).

## Deploying

```
modal deploy ocr-service/app.py
```

Prints the endpoint URL - copy it into `OCR_SERVICE_URL` in `backend/.env`.
Requires `modal setup` to have been run once on the machine deploying (already
done on the original dev machine; a new machine needs to run it once).

`fastapi[standard]` must also be installed in the *local* Python environment
used to run `modal deploy`, not just inside the deployed image - the Modal
CLI imports `app.py` locally first to find the `App` object, and that import
executes the top-level `from fastapi import ...` line too.

```
pip install "fastapi[standard]"
```

## Auth

The endpoint checks `Authorization: Bearer <token>` against the
`OCR_SERVICE_TOKEN` value of the `ocr-service-token` Modal secret. Create or
rotate it with:

```
modal secret create ocr-service-token OCR_SERVICE_TOKEN=<value> --force
```

The same value must be set as `OCR_SERVICE_TOKEN` in `backend/.env`.

## Request/response contract

- Request: raw image bytes as the POST body (no multipart, no JSON wrapper).
- Response: `{ "lines": [{ "text": str, "confidence": 0-100 float, "bbox": {"x0","y0","x1","y1"} }] }`.
  Confidence is rescaled from EasyOCR's native 0-1 to 0-100 so the Node-side
  matching/filtering thresholds (tuned against Tesseract's 0-100 scale) don't
  need to know which engine produced a line.
- No `fullText` and no `rotation` field - those are constructed on the Node
  side (`easyocrProvider.js`), which already knows which spine crop a call
  belongs to. This endpoint only ever sees one image at a time and has no
  concept of "which spine".

## Gotchas hit building this

- `@modal.fastapi_endpoint` needs the handler's request parameter annotated
  as `request: Request` (imported from `fastapi`). Without the annotation,
  Modal/FastAPI treats `request` as a plain required query parameter instead
  of injecting the framework request object, and every call 422s with
  `"loc": ["query", "request"], "msg": "Field required"`.
- EasyOCR's bounding-box coordinates and confidence are numpy scalar types
  (`int32`/`float32`), not native Python `int`/`float`. `JSONResponse` uses
  stdlib `json.dumps`, which rejects numpy scalars outright
  (`TypeError: Object of type int32 is not JSON serializable`) - cast
  explicitly (`int(...)`, `float(...)`) before returning.
- `libgl1`/`libglib2.0-0` must be `apt_install`ed in the image - opencv
  (an EasyOCR dependency) fails to import without them
  (`ImportError: libGL.so.1: cannot open shared object file`).
- Uploading a crop at full photo resolution (some real spine crops are
  20-40MB PNGs) makes a single request take 15-100+ seconds, dominated by
  transfer and EasyOCR's own compute time on a huge image - not useful, since
  OCR only needs ~20-30px character height. `easyocrProvider.js` downsizes
  every crop to 1500px on the long edge (JPEG, quality 85) before upload;
  this measurably *improved* accuracy on a real test crop, not just speed.
- Model load (EasyOCR + torch import) happens once per container via
  `@modal.enter()`, not per request - but the first request after the
  container has scaled to zero still pays that cost. Not a bug; expected
  per CLAUDE.md.
