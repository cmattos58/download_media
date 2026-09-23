# 🚀 MediaFetch Web

Sistema Web moderno, rápido e completo para download e extração de vídeos e áudios a partir de centenas de plataformas na web (YouTube, Instagram, TikTok, Twitter/X, SoundCloud, Facebook, Twitch, Vimeo, etc.), utilizando o poder do **`yt-dlp`** e do **`ffmpeg`**.

---

## 🌟 Principais Recursos

- 🖥️ **Interface Web Moderna e Responsiva**:
  - Dark mode sofisticado com Tailwind CSS e ícones Lucide.
  - Otimizado para desktop, tablets e smartphones.
- ⚡ **Modo Individual com Prévia em Tempo Real**:
  - Insira ou cole uma URL e veja thumbnail, título, canal e duração antes de baixar.
  - Seleção de formato:
    - **Vídeo**: Resoluções (4K, 1080p, 720p, etc.) e containers (**MP4**, **MKV**, **WebM**).
    - **Áudio**: Formatos (**MP3**, **M4A**, **FLAC**, **WAV**, **OPUS**) e taxas de bits (320k, 256k, 192k, 128k).
- 📦 **Download em Lote (Batch)**:
  - Cole múltiplas URLs de uma vez (uma por linha).
  - Envio direto de arquivo `.txt` via arrastar e soltar (drag & drop).
  - Botão de conveniência para importar URLs do arquivo local `videos.txt`.
- 📊 **Fila de Atividades e Concorrência**:
  - Barra de progresso com porcentagem em tempo real via **Server-Sent Events (SSE)** sem recarregar a página.
  - Indicadores ao vivo de velocidade (ex: `4.5 MB/s`), tamanho baixado e tempo estimado (ETA).
  - Controle de concorrência configurável (1 a 5 downloads simultâneos) para evitar bloqueios de rede.
  - Pausar / Retomar fila, cancelar tarefas ou tentar novamente em caso de falha.
  - **Terminal ao Vivo**: Visualizador com logs detalhados do `yt-dlp` para depuração.
- 🎬 **Biblioteca de Mídias e Player Integrado**:
  - Gerenciador de arquivos baixados com busca e filtros (Todos, Vídeos, Áudios).
  - **Player de Áudio e Vídeo no Navegador** com suporte a streaming HTTP 206 (Byte-Range requests para busca e avanço instantâneos).
  - Botões para "Baixar para o PC", "Copiar Link" ou "Excluir".
- ⚙️ **Diagnósticos & Sistema**:
  - Exibe versões de `yt-dlp`, `ffmpeg`, `Node.js` e memória disponível.
  - Botão de 1 clique para atualizar o `yt-dlp` (`yt-dlp -U`).
  - Persistência com SQLite integrado (`node:sqlite`).

---

## 🛠️ Tecnologias Utilizadas

- **Runtime**: [Node.js](https://nodejs.org/) (v22+; testado com v24)
- **Framework Web**: [Express.js](https://expressjs.com/)
- **Banco de Dados**: SQLite Nativo (`node:sqlite`, zero compilação e alta performance)
- **Download & Conversão**: [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [FFmpeg](https://ffmpeg.org/)
- **Tempo Real**: Server-Sent Events (SSE) nativo
- **Frontend**: HTML5, Tailwind CSS, Lucide Icons, Vanilla JavaScript moderno

---

## 🚀 Como Executar

### Opção 1: Inicialização Rápida (Script)

Basta executar o script fornecido na raiz da pasta:

```bash
./iniciar_web.sh
```

O script verificará as dependências, criará as pastas necessárias e iniciará o servidor.

### Opção 2: Via NPM

```bash
# 1. Instalar dependências (caso não tenham sido instaladas)
npm install

# 2. Iniciar servidor
npm start
```

Para desenvolvimento com auto-reload:
```bash
npm run dev
```

### Opção 3: Via Docker / Docker Compose

Se preferir isolar a aplicação em contêiner:

```bash
docker compose up -d --build
```

---

## 🌐 Acessando a Aplicação

Abra o seu navegador web:
- **Localmente**: [http://localhost:3000](http://localhost:3000)
- **Na sua rede local**: `http://IP_DO_SEU_COMPUTADOR:3000`

---

## 📁 Estrutura do Projeto

```
download_media/
├── server/
│   ├── config.js            # Configurações globais e caminhos
│   ├── db.js                # Banco SQLite para fila e histórico
│   ├── downloader.js        # Execução e parsing do yt-dlp / ffmpeg
│   ├── queue.js             # Gerenciador da fila e concorrência
│   ├── app.js               # Configuração do Express e middlewares
│   └── routes/
│       ├── api.js           # Endpoints REST (jobs, library, system, settings)
│       └── sse.js           # Server-Sent Events para progresso em tempo real
├── public/
│   ├── index.html           # Interface web SPA moderna
│   ├── css/style.css        # Efeitos visuais e animações
│   ├── js/app.js            # Lógica do frontend e player integrado
│   └── favicon.svg          # Ícone da aplicação
├── downloads/
│   ├── videos/              # Mídias de vídeo baixadas
│   └── audios/              # Mídias de áudio extraídas
├── data/
│   └── downloads.db         # Banco de dados local SQLite
├── server.js                # Ponto de entrada do servidor
├── iniciar_web.sh           # Script de inicialização em 1 comando
├── Dockerfile               # Imagem Docker
├── docker-compose.yml       # Orquestração de contêiner
└── package.json
```

---

## 📡 Endpoints da API REST

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/info?url=...` | Obtém metadados da mídia (título, thumbnail, etc.) |
| `POST` | `/api/jobs` | Cria uma ou múltiplas tarefas de download |
| `POST` | `/api/jobs/upload-file` | Faz upload de arquivo `.txt` com links |
| `POST` | `/api/jobs/import-local` | Importa URLs do `videos.txt` local |
| `GET` | `/api/jobs` | Lista tarefas da fila e histórico com estatísticas |
| `GET` | `/api/jobs/:id` | Detalhes e logs completos de uma tarefa |
| `POST` | `/api/jobs/:id/cancel` | Cancela uma tarefa em andamento |
| `POST` | `/api/jobs/:id/retry` | Reinicia uma tarefa com falha |
| `DELETE` | `/api/jobs/:id` | Remove uma tarefa do histórico |
| `POST` | `/api/jobs/clear-completed` | Limpa tarefas concluídas da lista |
| `POST` | `/api/queue/pause` / `resume` | Pausa ou retoma o processamento da fila |
| `GET` | `/api/library` | Lista arquivos baixados em disco |
| `GET` | `/api/library/stream/:type/:name` | Transmissão de áudio/vídeo (com Range HTTP 206) |
| `GET` | `/api/library/download/:type/:name` | Download do arquivo para o PC |
| `DELETE` | `/api/library/:type/:name` | Exclui arquivo do disco |
| `GET` | `/api/system` | Status e diagnósticos do sistema |
| `POST` | `/api/system/update-ytdlp` | Executa atualização do yt-dlp (`-U`) |
| `GET` | `/api/settings` | Obtém configurações de preferências |
| `POST` | `/api/settings` | Atualiza configurações de preferências |
| `GET` | `/api/events` | Stream SSE de eventos em tempo real |
