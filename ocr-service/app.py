import io
import os

import modal
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

app = modal.App("libraryapp-ocr")

# libgl1/libglib2.0-0 satisfy opencv-python-headless (an easyocr dependency) -
# without them the container fails to import easyocr with
# "ImportError: libGL.so.1: cannot open shared object file", not an easyocr
# or torch problem.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("easyocr==1.7.2", "fastapi[standard]", "pillow")
)

# Tried in one call alongside the base (0deg) orientation - this is what
# replaces tesseractProvider's separate per-rotation Tesseract passes.
# Validated against real spine crops in a prior session (see LibraryApp's
# CLAUDE.md) - reused here rather than re-derived.
ROTATION_INFO = [90, 180, 270]


@app.cls(image=image, secrets=[modal.Secret.from_name("ocr-service-token")])
class OCRService:
    @modal.enter()
    def load_reader(self):
        # Loaded once per container (not per request) - this import and model
        # load is the real cold-start cost noted in CLAUDE.md, expect it on
        # the first request after the container has scaled to zero.
        import easyocr

        self.reader = easyocr.Reader(['en'], gpu=False)

    @modal.fastapi_endpoint(method="POST")
    async def recognize(self, request: Request):
        from PIL import Image
        import numpy as np

        expected_token = os.environ["OCR_SERVICE_TOKEN"]
        provided = request.headers.get("authorization", "")
        if provided != f"Bearer {expected_token}":
            raise HTTPException(status_code=401, detail="Unauthorized")

        body = await request.body()
        if not body:
            raise HTTPException(status_code=400, detail="Empty request body")

        try:
            img = Image.open(io.BytesIO(body)).convert("RGB")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid image: {exc}")

        results = self.reader.readtext(np.array(img), rotation_info=ROTATION_INFO)

        # Axis-aligned bbox from EasyOCR's 4-point quad, and confidence
        # rescaled from EasyOCR's 0-1 to the 0-100 scale the Node-side
        # matching/filtering logic (MIN_LINE_CONFIDENCE etc.) already
        # assumes from tesseractProvider.js - keeps the contract identical
        # for both providers rather than pushing scale-handling downstream.
        lines = []
        for bbox, text, confidence in results:
            # EasyOCR's box coords and confidence are numpy scalar types
            # (int32/float32), not native Python ones - json.dumps rejects
            # those outright, so cast explicitly before returning.
            xs = [int(point[0]) for point in bbox]
            ys = [int(point[1]) for point in bbox]
            lines.append({
                "text": text,
                "confidence": round(float(confidence) * 100, 1),
                "bbox": {
                    "x0": min(xs),
                    "y0": min(ys),
                    "x1": max(xs),
                    "y1": max(ys),
                },
            })

        return JSONResponse({"lines": lines})
