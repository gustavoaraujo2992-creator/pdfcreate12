# Como Hospedar o PDFNice de Graça (Passo a Passo)

Como o sistema PDFNice conta com uma Inteligência Artificial (OCR) pesada no "Backend", ele **não pode** ser hospedado no GitHub Pages. 

Preparei todo o código para ser **100% compatível com o Render.com** de forma automática ("Single Server Deploy"). Siga os passos abaixo:

### Passo 1: Autenticar e Subir para o GitHub
Primeiro, garanta que seu código está no GitHub. Como as senhas pararam de funcionar no GitHub em 2021, faça isso:
1. Abra o seu terminal.
2. Digite: `gh auth login` e siga os passos na tela (escolha GitHub.com -> HTTPS -> Login with browser).
3. Depois de logar, rode: `git push -u origin main`.

### Passo 2: Criar a conta no Render.com
1. Acesse [https://render.com](https://render.com) e crie uma conta (pode fazer login direto com seu GitHub).
2. No painel inicial (Dashboard), clique no botão **"New +"** no canto superior direito e escolha **"Web Service"**.

### Passo 3: Configurar o Serviço
1. Escolha a opção **"Build and deploy from a Git repository"** (Construir a partir do GitHub).
2. Conecte sua conta do GitHub e selecione o repositório `pdfcreate12`.
3. Preencha as configurações exatamente assim:
   - **Name:** pdfnice (ou o nome que preferir)
   - **Region:** Ohio (US East) ou qualquer outra.
   - **Branch:** `main`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Selecione o plano **Free** ($0/month).
5. Clique em **"Create Web Service"**.

### Passo 4: Aguardar e Acessar
O Render vai começar a instalar o Tesseract (OCR), o Vite e compilar todo o seu sistema. Isso pode demorar uns 3 a 5 minutos na primeira vez.

Quando o log do Render disser `Your service is live 🎉`, você verá um link no topo esquerdo estilo `https://pdfnice-xxxx.onrender.com`.

**Pronto!** Aquele link é o seu sistema rodando na nuvem com o banco de dados visual (OCR) ligado 24h por dia. Você pode abrir o link no celular ou outro computador e testar o envio dos PDEs.
