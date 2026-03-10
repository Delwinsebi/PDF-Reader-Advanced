from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF

app = FastAPI()

# Crucial: Allows your React frontend to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    # Read the uploaded file bytes
    file_bytes = await file.read()
    
    # Open the PDF directly from memory using Fitz
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    
    full_text = ""
    for page in doc:
        full_text += f"--- Page {page.number + 1} ---\n"
        full_text += page.get_text() + "\n\n"
        
    doc.close()
    return {"text": full_text}