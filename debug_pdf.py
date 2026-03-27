import PyPDF2
import json

path = r'C:\Users\leonardo.pedrosa\Documents\Agenda INSS 25-03-2026.pdf'
try:
    with open(path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        results = []
        for i in range(len(reader.pages)):
            page = reader.pages[i]
            text = page.extract_text()
            results.append({
                "page": i + 1,
                "text_length": len(text),
                "preview": text[:500] if text else "EMPTY"
            })
        print(json.dumps(results, indent=2))
except Exception as e:
    print(f"Error: {e}")
