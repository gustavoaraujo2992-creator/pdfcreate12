# PDFNice - Premium Extraction Engine

**PDFNice** é um sistema inteligente (Arquitetura Cliente-Servidor) desenvolvido para extrair relatórios de escalas de funcionários a partir de arquivos PDF complexos (especialmente aqueles com fontes protegidas CID-encoded que bloqueiam cópias normais de texto).

## 🚀 Como funciona

O projeto possui **duas partes**:
1. **Frontend (Vite)**: Uma interface premium, dark-mode, com dashboard interativo, buscas em tempo real e exportação CSV.
2. **Backend (Node.js/Express)**: O verdadeiro motor da aplicação. Ele converte cada página do PDF em imagem e utiliza **OCR (Reconhecimento Ótico de Caracteres via Tesseract.js)** para ler o texto, ignorando a proteção do PDF.

## 💻 Como rodar localmente

Você precisa abrir **dois terminais** na pasta do projeto:

**Terminal 1 (Backend de Extração OCR)**
```bash
npm install
npm run server
```
*Irá iniciar o servidor na porta 3001.*

**Terminal 2 (Interface Gráfica)**
```bash
npm run dev
```
*Irá iniciar o site na porta 5173 (ou similar). Acesse `http://localhost:5173` no navegador.*

## 🌐 Como hospedar na Internet (Importante!)

Como o sistema agora usa um **Backend (Node.js + Tesseract)** para quebrar a proteção dos arquivos PDF, **NÃO É POSSÍVEL ALOJAR O SISTEMA COMPLETO NO GITHUB PAGES**. O GitHub Pages hospeda apenas sites estáticos (HTML/CSS), não servidores em Node.js.

Para colocar esse sistema online para acessar de outros computadores, você precisa de um provedor de hospedagem de aplicação:

### Opção 1: Render (Recomendado e Grátis)
1. Crie uma conta no [Render.com](https://render.com)
2. Crie um novo **Web Service** conectado ao seu GitHub (`pdfcreate12`).
3. O Render vai detectar o Node.js automaticamente.
4. Mude o comando de início para: `npm run server`.
5. Hospede o Frontend separadamente no Vercel ou altere a lógica para o Express servir também os arquivos estáticos compilados do Vite.

### Opção 2: Ngrok (Acesso temporário)
Se você quer apenas que alguém acesse da sua casa enquanto seu PC estiver ligado, você pode instalar o `ngrok` e criar um túnel público para o seu `localhost:5173`.
