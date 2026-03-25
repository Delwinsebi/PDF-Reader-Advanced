import os
import fitz
import io
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uuid import uuid4

app = FastAPI()

# --- PADDLEOCR CONFIGURATION ---
# lang='hi' includes both Hindi and English (Latin) scripts
# use_angle_cls=True automatically fixes rotated scans (no need for OSD)
ocr = PaddleOCR(use_angle_cls=True, lang='hi', show_log=False)

PDF_STORE: dict[str, bytes] = {}
OCR_CACHE: dict[str, list] = {} 
MAX_STORED_DOCS = 8

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    doc_id: str
    query: str

def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))

@app.post("/upload")
async def process_pdf(file: UploadFile = File(...)):
    data = await file.read()
    doc = fitz.open(stream=data, filetype="pdf")
    doc_id = uuid4().hex
    PDF_STORE[doc_id] = data
    OCR_CACHE[doc_id] = []
    
    parts = []
    digital_text = "".join([page.get_text() for page in doc])

    if len(digital_text.strip()) > 50:
        for page in doc:
            parts.append(f"--- Page {page.number + 1} ---\n{page.get_text()}")
    else:
        parts.append("--- [Scanned PDF: Processing with PaddleOCR] ---")
        for page in doc:
            # PaddleOCR works best at 2x resolution
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, 3))
            
            # PaddleOCR returns: [ [ [bbox], (text, confidence) ], ... ]
            result = ocr.ocr(img, cls=True)
            
            page_text = ""
            if result[0]:
                OCR_CACHE[doc_id].append({
                    "page": page.number + 1,
                    "data": result[0],
                    "width": pix.width,
                    "height": pix.height
                })
                for line in result[0]:
                    page_text += line[1][0] + " "
            
            parts.append(f"--- Page {page.number + 1} ---\n{page_text.strip()}")

    doc.close()
    return {"doc_id": doc_id, "text": "\n".join(parts)}

@app.post("/search")
async def search_text(payload: SearchRequest):
    query = payload.query.lower().strip()
    if not query: return {"hits": []}

    cached_pages = OCR_CACHE.get(payload.doc_id, [])
    hits = []

    # 1. Digital Search (Quick fallback)
    data = PDF_STORE.get(payload.doc_id)
    doc = fitz.open(stream=data, filetype="pdf")
    for page in doc:
        rects = page.search_for(payload.query)
        for r in rects:
            hits.append({
                "page": page.number + 1,
                "x": clamp01(r.x0 / page.rect.width),
                "y": clamp01(r.y0 / page.rect.height),
                "w": clamp01(r.width / page.rect.width),
                "h": clamp01(r.height / page.rect.height)
            })

    # 2. Scanned Search (Using Paddle Cache)
    for page_entry in cached_pages:
        p_num = page_entry["page"]
        p_w, p_h = page_entry["width"], page_entry["height"]
        
        for line in page_entry["data"]:
            bbox = line[0] # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            text = line[1][0].lower()
            
            if query in text:
                # Calculate bounding box from 4 points
                x_min = min([p[0] for p in bbox])
                y_min = min([p[1] for p in bbox])
                x_max = max([p[0] for p in bbox])
                y_max = max([p[1] for p in bbox])
                
                hits.append({
                    "page": p_num,
                    "x": clamp01(x_min / p_w),
                    "y": clamp01(y_min / p_h),
                    "w": clamp01((x_max - x_min) / p_w),
                    "h": clamp01((y_max - y_min) / p_h)
                })
    
    doc.close()
    return {"hits": hits}