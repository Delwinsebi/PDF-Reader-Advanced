import os
import fitz
import io
import pytesseract
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from uuid import uuid4

app = FastAPI()

# --- CONFIGURATION ---
# Set this to the path you got from 'which tesseract'
pytesseract.pytesseract.tesseract_cmd = r'/usr/bin/tesseract'

PDF_STORE: dict[str, bytes] = {}
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

def normalize_text(value: str) -> str:
    return " ".join(value.split())

def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))

def save_document(data: bytes) -> str:
    doc_id = uuid4().hex
    PDF_STORE[doc_id] = data
    while len(PDF_STORE) > MAX_STORED_DOCS:
        oldest_doc_id = next(iter(PDF_STORE))
        PDF_STORE.pop(oldest_doc_id, None)
    return doc_id

@app.post("/upload")
async def process_pdf(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid PDF")

    doc_id = save_document(data)
    parts = []

    # Check for digital text layer
    digital_text = ""
    for page in doc:
        digital_text += page.get_text()

    # If the PDF has actual text, use the fast digital extraction
    if len(digital_text.strip()) > 50:
        for page in doc:
            parts.append(f"--- Page {page.number + 1} ---")
            parts.append(page.get_text())
    else:
        # It's a scanned PDF - Fallback to Tesseract OCR
        parts.append("--- [Scanned PDF Detected - Performing OCR] ---")
        for page in doc:
            # 1. Render page at high resolution (300 DPI) for better OCR
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            
            # 2. Perform OCR using Tesseract
            page_text = pytesseract.image_to_string(img, lang='eng')
            
            parts.append(f"--- Page {page.number + 1} ---")
            parts.append(page_text.strip() if page_text.strip() else "[No text detected]")

    doc.close()
    return {"doc_id": doc_id, "text": "\n".join(parts)}

import pandas as pd # Make sure to: pip install pandas

from pytesseract import Output

@app.post("/search")
async def search_text(payload: SearchRequest):
    query = normalize_text(payload.query).lower()
    if not query:
        return {"query": "", "hits": []}

    data = PDF_STORE.get(payload.doc_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc = fitz.open(stream=data, filetype="pdf")
    hits = []

    try:
        for page_number, page in enumerate(doc, start=1):
            # 1. Digital Search (Instant)
            rects = page.search_for(payload.query)
            if rects:
                w, h = page.rect.width, page.rect.height
                for rect in rects:
                    hits.append({
                        "page": page_number,
                        "x": clamp01(rect.x0 / w),
                        "y": clamp01(rect.y0 / h),
                        "w": clamp01(rect.width / w),
                        "h": clamp01(rect.height / h),
                    })
            else:
                # 2. Scanned OCR Search (Optimized for English)
                # Using Matrix(2, 2) is the sweet spot for English speed/accuracy
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                
                # lang='eng' : Only loads English (Fastest)
                # --psm 6  : Assumes a single uniform block of text (Very fast)
                # --oem 1  : Use only the LSTM engine (Modern & fast)
                tess_config = '--psm 6 --oem 1'
                
                d = pytesseract.image_to_data(
                    img, 
                    lang='eng', 
                    config=tess_config, 
                    output_type=pytesseract.Output.DICT
                )
                
                n_boxes = len(d['text'])
                for i in range(n_boxes):
                    found = str(d['text'][i]).lower()
                    if query in found:
                        # Filter out low-confidence noise to keep UI clean
                        if int(d['conf'][i]) > 40: 
                            hits.append({
                                "page": page_number,
                                "x": clamp01(d['left'][i] / pix.width),
                                "y": clamp01(d['top'][i] / pix.height),
                                "w": clamp01(d['width'][i] / pix.width),
                                "h": clamp01(d['height'][i] / pix.height),
                            })
    finally:
        doc.close()

    return {"query": payload.query, "hits": hits}