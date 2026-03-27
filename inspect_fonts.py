from PyPDF2 import PdfReader

path = r'C:\Users\leonardo.pedrosa\Documents\Agenda INSS 25-03-2026.pdf'
reader = PdfReader(path)
page = reader.pages[0]

def visitor_body(text, cm, tm, font_dict, font_size):
    if text.strip():
        print(f"TEXT: {text!r} | FONT: {font_dict.get('/BaseFont', 'N/A')}")

print("--- EXAMINING PAGE 0 ---")
page.extract_text(visitor_text=visitor_body)
