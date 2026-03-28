import PyPDF2
path = r'C:\Users\leonardo.pedrosa\Documents\agendamentos-2026-03-27T10_20_17.868943437Z.pdf'
with open(path, 'rb') as f:
    reader = PyPDF2.PdfReader(f)
    with open('output_pdf_new_py.txt', 'w', encoding='utf-8') as out:
        for i in range(len(reader.pages)):
            page = reader.pages[i]
            text = page.extract_text()
            out.write(text + '\n')
