from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import fitz  # This is PyMuPDF
import io

app = FastAPI()

# Allow React to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Standard React port
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload")
async def process_pdf(file: UploadFile = File(...)):
    # Read the file bytes
    data = await file.read()
    
    # Open PDF with fitz
    doc = fitz.open(stream=data, filetype="pdf")
    
    full_text = ""
    for page in doc:
        full_text += f"--- Page {page.number + 1} ---\n"
        full_text += page.get_text() + "\n\n"
        
    doc.close()
    return {"text": full_text}