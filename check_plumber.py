import pdfplumber
import json

path = r'C:\Users\leonardo.pedrosa\Documents\Agenda INSS 25-03-2026.pdf'
results = []

try:
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            results.append({
                "page": i + 1,
                "text": text[:1000] if text else "EMPTY"
            })
    print(json.dumps(results, indent=2))
except Exception as e:
    print(f"Error: {e}")
