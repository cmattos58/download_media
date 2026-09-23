/**
 * MediaFetch Web - Frontend Application
 */

const state = {
  currentTab: 'tab-new',
  downloadMode: 'single', // 'single' | 'batch'
  singleType: 'video', // 'video' | 'audio'
  batchType: 'video',
  currentPreview: null,
  jobs: [],
  libraryItems: [],
  libraryFilter: 'all',
  activeLogJobId: null,
  logLines: {},
  stats: {
    running: 0,
    queued: 0,
    completed: 0,
    failed: 0,
    total: 0
  }
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
  } catch (_) {
    return '#';
  }
}

function encodeForInlineArgument(value) {
  return encodeURIComponent(value).replace(/'/g, '%27');
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center space-x-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all transform duration-300 translate-y-2 opacity-0 ${
    type === 'success' ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30' :
    type === 'error' ? 'bg-rose-950/90 text-rose-200 border-rose-500/30' :
    'bg-slate-900/90 text-slate-200 border-slate-700'
  }`;

  const iconName = type === 'success' ? 'check-circle-2' : type === 'error' ? 'alert-circle' : 'info';
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 flex-shrink-0"></i>
    <span class="flex-1">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================
// TABS NAVIGATION
// ==========================================
function switchTab(tabId) {
  state.currentTab = tabId;
  const tabs = ['tab-new', 'tab-queue', 'tab-library', 'tab-settings'];

  tabs.forEach(t => {
    const el = document.getElementById(t);
    const btn = document.getElementById(`btn-${t}`);
    if (el && btn) {
      if (t === tabId) {
        el.classList.remove('hidden');
        btn.classList.add('text-blue-400', 'bg-blue-500/10', 'border', 'border-blue-500/20');
        btn.classList.remove('text-slate-400', 'hover:text-slate-200');
      } else {
        el.classList.add('hidden');
        btn.classList.remove('text-blue-400', 'bg-blue-500/10', 'border', 'border-blue-500/20');
        btn.classList.add('text-slate-400', 'hover:text-slate-200');
      }
    }
  });

  if (tabId === 'tab-library') {
    loadLibrary();
  } else if (tabId === 'tab-settings') {
    loadSystemInfo();
    loadSettings();
  }
}

// ==========================================
// DOWNLOAD MODE TOGGLE (SINGLE / BATCH)
// ==========================================
function toggleDownloadMode(mode) {
  state.downloadMode = mode;
  const singleView = document.getElementById('view-single');
  const batchView = document.getElementById('view-batch');
  const singleBtn = document.getElementById('mode-single-btn');
  const batchBtn = document.getElementById('mode-batch-btn');

  if (mode === 'single') {
    singleView.classList.remove('hidden');
    batchView.classList.add('hidden');
    singleBtn.className = 'flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white shadow transition-all';
    batchBtn.className = 'flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 transition-all';
  } else {
    singleView.classList.add('hidden');
    batchView.classList.remove('hidden');
    batchBtn.className = 'flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white shadow transition-all';
    singleBtn.className = 'flex items-center space-x-2 px-5 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 transition-all';
    updateBatchUrlCounter();
  }
}

function selectSingleType(type) {
  state.singleType = type;
  const vidBtn = document.getElementById('type-video-btn');
  const audBtn = document.getElementById('type-audio-btn');
  const vidOpts = document.getElementById('video-options-container');
  const audOpts = document.getElementById('audio-options-container');

  if (type === 'video') {
    vidBtn.className = 'flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border border-blue-500 bg-blue-500/15 text-blue-300 font-medium text-sm transition-all';
    audBtn.className = 'flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 font-medium text-sm hover:border-slate-700 transition-all';
    vidOpts.classList.remove('hidden');
    audOpts.classList.add('hidden');
  } else {
    audBtn.className = 'flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border border-blue-500 bg-blue-500/15 text-blue-300 font-medium text-sm transition-all';
    vidBtn.className = 'flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 font-medium text-sm hover:border-slate-700 transition-all';
    audOpts.classList.remove('hidden');
    vidOpts.classList.add('hidden');
  }
}

function selectBatchType(type) {
  state.batchType = type;
  const vidBtn = document.getElementById('batch-type-video-btn');
  const audBtn = document.getElementById('batch-type-audio-btn');
  const vidOpts = document.getElementById('batch-video-opts');
  const audOpts = document.getElementById('batch-audio-opts');

  if (type === 'video') {
    vidBtn.className = 'flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border border-blue-500 bg-blue-500/15 text-blue-300 font-medium text-sm transition-all';
    audBtn.className = 'flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 font-medium text-sm hover:border-slate-700 transition-all';
    vidOpts.classList.remove('hidden');
    audOpts.classList.add('hidden');
  } else {
    audBtn.className = 'flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border border-blue-500 bg-blue-500/15 text-blue-300 font-medium text-sm transition-all';
    vidBtn.className = 'flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 font-medium text-sm hover:border-slate-700 transition-all';
    audOpts.classList.remove('hidden');
    vidOpts.classList.add('hidden');
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      document.getElementById('single-url').value = text.trim();
      analyzeSingleUrl();
    }
  } catch (err) {
    showToast('Não foi possível ler da área de transferência', 'error');
  }
}

// ==========================================
// URL ANALYSIS & METADATA PREVIEW
// ==========================================
async function analyzeSingleUrl() {
  const urlInput = document.getElementById('single-url');
  const url = (urlInput.value || '').trim();
  if (!url) {
    showToast('Insira uma URL para analisar', 'error');
    return;
  }

  const btnAnalyze = document.getElementById('btn-analyze');
  const previewCard = document.getElementById('single-preview');
  
  btnAnalyze.disabled = true;
  btnAnalyze.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin text-blue-400"></i><span>Analisando...</span>';
  lucide.createIcons();

  try {
    const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao analisar URL');
    }

    state.currentPreview = data;

    // Fill preview
    document.getElementById('preview-title').textContent = data.title || 'Sem título';
    document.getElementById('preview-uploader').textContent = data.uploader || 'Desconhecido';
    document.getElementById('preview-extractor').textContent = data.extractor || 'Web';
    document.getElementById('preview-duration').textContent = data.durationString || '00:00';
    document.getElementById('preview-desc').textContent = data.description || '';
    
    const thumbEl = document.getElementById('preview-thumb');
    if (data.thumbnail) {
      thumbEl.src = data.thumbnail;
      thumbEl.classList.remove('hidden');
    } else {
      thumbEl.classList.add('hidden');
    }

    previewCard.classList.remove('hidden');
    showToast('Mídia analisada com sucesso!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnAnalyze.disabled = false;
    btnAnalyze.innerHTML = '<i data-lucide="search" class="w-4 h-4 text-blue-400"></i><span>Analisar</span>';
    lucide.createIcons();
  }
}

// ==========================================
// START DOWNLOADS (SINGLE & BATCH)
// ==========================================
async function startSingleDownload() {
  const urlInput = document.getElementById('single-url');
  const url = (urlInput.value || '').trim();
  if (!url) {
    showToast('Informe a URL da mídia', 'error');
    return;
  }

  const isAudio = state.singleType === 'audio';
  const format = isAudio 
    ? document.getElementById('audio-format').value 
    : document.getElementById('video-format').value;
  const quality = isAudio 
    ? document.getElementById('audio-quality').value 
    : document.getElementById('video-quality').value;

  const title = state.currentPreview ? state.currentPreview.title : '';
  const thumbnail = state.currentPreview ? state.currentPreview.thumbnail : '';

  const btn = document.getElementById('btn-start-single');
  btn.disabled = true;
  btn.classList.add('opacity-70');

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        mediaType: state.singleType,
        format,
        quality,
        title,
        thumbnail
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao iniciar download');
    }

    showToast('Download adicionado à fila!', 'success');
    urlInput.value = '';
    document.getElementById('single-preview').classList.add('hidden');
    state.currentPreview = null;
    
    // Switch to queue tab so user sees progress immediately
    switchTab('tab-queue');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-70');
  }
}

function updateBatchUrlCounter() {
  const text = (document.getElementById('batch-urls').value || '').trim();
  const lines = text.split('\n').filter(l => {
    const t = l.trim();
    return t && !t.startsWith('#') && (t.startsWith('http://') || t.startsWith('https://'));
  });

  const count = lines.length;
  document.getElementById('batch-url-counter').textContent = `${count} ${count === 1 ? 'URL válida detectada' : 'URLs válidas detectadas'}`;
  document.getElementById('btn-start-batch-label').textContent = count > 0 
    ? `Adicionar ${count} ${count === 1 ? 'Mídia' : 'Mídias'} à Fila`
    : 'Adicionar à Fila de Downloads';
}

async function startBatchDownload() {
  const text = (document.getElementById('batch-urls').value || '').trim();
  const urls = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && (l.startsWith('http://') || l.startsWith('https://')));

  if (urls.length === 0) {
    showToast('Nenhuma URL válida informada no campo de lote', 'error');
    return;
  }

  const isAudio = state.batchType === 'audio';
  const format = isAudio 
    ? document.getElementById('batch-audio-format').value 
    : document.getElementById('batch-video-format').value;
  const quality = isAudio 
    ? document.getElementById('batch-audio-quality').value 
    : document.getElementById('batch-video-quality').value;

  const btn = document.getElementById('btn-start-batch');
  btn.disabled = true;
  btn.classList.add('opacity-70');

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls,
        mediaType: state.batchType,
        format,
        quality
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao processar lote');
    }

    showToast(`${data.count} downloads adicionados à fila!`, 'success');
    document.getElementById('batch-urls').value = '';
    updateBatchUrlCounter();
    switchTab('tab-queue');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-70');
  }
}

async function handleFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('mediaType', state.batchType);
  
  const isAudio = state.batchType === 'audio';
  formData.append('format', isAudio ? document.getElementById('batch-audio-format').value : document.getElementById('batch-video-format').value);
  formData.append('quality', isAudio ? document.getElementById('batch-audio-quality').value : document.getElementById('batch-video-quality').value);

  showToast(`Enviando arquivo ${file.name}...`, 'info');

  try {
    const res = await fetch('/api/jobs/upload-file', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao enviar arquivo');
    }

    showToast(`${data.count} URLs carregadas do arquivo!`, 'success');
    switchTab('tab-queue');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    event.target.value = '';
  }
}

async function importLocalVideosTxt() {
  const isAudio = state.batchType === 'audio';
  const format = isAudio ? document.getElementById('batch-audio-format').value : document.getElementById('batch-video-format').value;
  const quality = isAudio ? document.getElementById('batch-audio-quality').value : document.getElementById('batch-video-quality').value;

  try {
    const res = await fetch('/api/jobs/import-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaType: state.batchType,
        format,
        quality
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao importar videos.txt');
    }

    showToast(`${data.count} URLs importadas do videos.txt!`, 'success');
    switchTab('tab-queue');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// JOBS & QUEUE MANAGEMENT
// ==========================================
async function loadJobs() {
  try {
    const res = await fetch('/api/jobs');
    const data = await res.json();
    state.jobs = data.jobs || [];
    if (data.stats) {
      updateStats(data.stats);
    }
    renderJobs();
  } catch (err) {
    console.error('Falha ao carregar jobs:', err);
  }
}

function updateStats(stats) {
  state.stats = stats;
  document.getElementById('stat-running').textContent = stats.running || 0;
  document.getElementById('stat-queued').textContent = stats.queued || 0;
  document.getElementById('stat-completed').textContent = stats.completed || 0;
  document.getElementById('stat-failed').textContent = (stats.failed || 0) + (stats.cancelled || 0);

  // Header active indicator
  const headerActiveBadge = document.getElementById('active-badge-header');
  const headerActiveCount = document.getElementById('active-count-header');
  const queueBadgeCount = document.getElementById('queue-badge-count');

  if (stats.running > 0) {
    headerActiveBadge.classList.remove('hidden');
    headerActiveBadge.classList.add('flex');
    headerActiveCount.textContent = stats.running;
  } else {
    headerActiveBadge.classList.add('hidden');
    headerActiveBadge.classList.remove('flex');
  }

  queueBadgeCount.textContent = (stats.running + stats.queued) || 0;
}

function renderJobs() {
  const container = document.getElementById('jobs-container');
  const emptyEl = document.getElementById('jobs-empty');

  if (!state.jobs || state.jobs.length === 0) {
    container.innerHTML = '';
    if (emptyEl) container.appendChild(emptyEl);
    return;
  }

  container.innerHTML = state.jobs.map(job => renderJobCard(job)).join('');
  lucide.createIcons();
}

function renderJobCard(job) {
  const isRunning = job.status === 'running';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isCancelled = job.status === 'cancelled';
  const isQueued = job.status === 'queued';

  let statusBadge = '';
  if (isRunning) {
    statusBadge = '<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center space-x-1.5"><span class="w-2 h-2 rounded-full bg-blue-400 live-pulse"></span><span>Baixando</span></span>';
  } else if (isCompleted) {
    statusBadge = '<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1"><i data-lucide="check" class="w-3.5 h-3.5"></i><span>Concluído</span></span>';
  } else if (isFailed) {
    statusBadge = '<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center space-x-1"><i data-lucide="alert-circle" class="w-3.5 h-3.5"></i><span>Falhou</span></span>';
  } else if (isCancelled) {
    statusBadge = '<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center space-x-1"><i data-lucide="slash" class="w-3.5 h-3.5"></i><span>Cancelado</span></span>';
  } else {
    statusBadge = '<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center space-x-1"><i data-lucide="clock" class="w-3.5 h-3.5"></i><span>Na Fila</span></span>';
  }

  const typeIcon = job.media_type === 'audio' ? 'music' : 'video';
  const typeLabel = job.media_type === 'audio' ? `Áudio (${job.format || 'MP3'})` : `Vídeo (${job.format || 'MP4'})`;
  const progressPercent = Math.min(100, Math.max(0, job.progress || 0));
  const title = job.title || job.url;
  const thumbnail = safeExternalUrl(job.thumbnail);
  const encodedFileName = encodeForInlineArgument(job.file_name || '');
  const encodedDisplayName = encodeForInlineArgument(job.title || job.file_name || 'Mídia');

  return `
    <div id="job-${job.id}" class="glass-panel p-4 sm:p-5 rounded-xl border border-slate-800 transition-all hover:border-slate-700">
      <div class="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        
        <!-- Info left side -->
        <div class="flex items-center space-x-3.5 min-w-0 flex-1">
          <div class="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
            ${thumbnail !== '#'
              ? `<img src="${escapeHtml(thumbnail)}" alt="" class="w-full h-full object-cover">` 
              : `<i data-lucide="${typeIcon}" class="w-6 h-6 text-slate-400"></i>`
            }
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center space-x-2">
              <span class="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">${escapeHtml(typeLabel)}</span>
              ${job.quality ? `<span class="text-xs text-slate-400">${escapeHtml(job.quality)}</span>` : ''}
            </div>
            <h4 class="text-sm font-semibold text-white truncate mt-1" title="${escapeHtml(title)}">
              ${escapeHtml(title)}
            </h4>
            <a href="${escapeHtml(safeExternalUrl(job.url))}" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-400/80 hover:text-blue-300 truncate block mt-0.5">
              ${escapeHtml(job.url)}
            </a>
          </div>
        </div>

        <!-- Status & Actions right side -->
        <div class="flex items-center space-x-2 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800/80">
          ${statusBadge}

          <div class="flex items-center space-x-1">
            <!-- View logs -->
            <button onclick="openLogModal('${job.id}')" class="p-1.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700 rounded-lg transition-all" title="Ver Logs">
              <i data-lucide="terminal" class="w-4 h-4"></i>
            </button>

            <!-- Actions based on state -->
            ${isRunning || isQueued ? `
              <button onclick="cancelJob('${job.id}')" class="p-1.5 text-rose-400 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-all" title="Cancelar">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            ` : ''}

            ${isFailed || isCancelled ? `
              <button onclick="retryJob('${job.id}')" class="p-1.5 text-amber-400 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-all" title="Tentar Novamente">
                <i data-lucide="rotate-cw" class="w-4 h-4"></i>
              </button>
            ` : ''}

            ${isCompleted && job.file_name ? `
              <button onclick="openPlayerModal('${job.media_type}', '${encodedFileName}', '${encodedDisplayName}')" class="p-1.5 text-emerald-400 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all" title="Reproduzir">
                <i data-lucide="play" class="w-4 h-4"></i>
              </button>
              <a href="/api/library/download/${job.media_type}/${encodeURIComponent(job.file_name)}" download class="p-1.5 text-blue-400 hover:text-blue-200 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-all" title="Baixar Arquivo">
                <i data-lucide="download" class="w-4 h-4"></i>
              </a>
            ` : ''}

            <button onclick="deleteJob('${job.id}')" class="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-all" title="Remover da Lista">
              <i data-lucide="trash" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

      </div>

      <!-- Progress Bar (shown when running or if has progress) -->
      ${isRunning || (isCompleted && progressPercent > 0) ? `
        <div class="mt-3.5 space-y-1.5">
          <div class="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span id="job-progress-text-${job.id}">${progressPercent.toFixed(1)}%</span>
            <div class="flex items-center space-x-3">
              ${job.speed ? `<span id="job-speed-${job.id}" class="text-blue-400">${escapeHtml(job.speed)}</span>` : ''}
              ${job.eta ? `<span id="job-eta-${job.id}">ETA: ${escapeHtml(job.eta)}</span>` : ''}
              ${job.total_size ? `<span id="job-size-${job.id}">${escapeHtml(job.downloaded_bytes || '0B')} / ${escapeHtml(job.total_size)}</span>` : ''}
            </div>
          </div>
          <div class="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
            <div 
              id="job-progress-bar-${job.id}" 
              class="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-300 ${isRunning ? 'progress-animated' : ''}" 
              style="width: ${progressPercent}%"
            ></div>
          </div>
        </div>
      ` : ''}

      <!-- Error message display if failed -->
      ${job.error_message ? `
        <div class="mt-3 p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start space-x-2">
          <i data-lucide="alert-octagon" class="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5"></i>
          <span class="break-all">${escapeHtml(job.error_message)}</span>
        </div>
      ` : ''}
    </div>
  `;
}

async function cancelJob(id) {
  try {
    const res = await fetch(`/api/jobs/${id}/cancel`, { method: 'POST' });
    if (res.ok) {
      showToast('Download cancelado', 'info');
    }
  } catch (err) {
    showToast('Falha ao cancelar: ' + err.message, 'error');
  }
}

async function retryJob(id) {
  try {
    const res = await fetch(`/api/jobs/${id}/retry`, { method: 'POST' });
    if (res.ok) {
      showToast('Download reiniciado!', 'success');
    }
  } catch (err) {
    showToast('Falha ao reiniciar: ' + err.message, 'error');
  }
}

async function deleteJob(id) {
  try {
    const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    if (res.ok) {
      state.jobs = state.jobs.filter(j => j.id !== id);
      renderJobs();
    }
  } catch (err) {
    showToast('Falha ao remover item: ' + err.message, 'error');
  }
}

async function clearCompletedJobs() {
  try {
    await fetch('/api/jobs/clear-completed', { method: 'POST' });
    loadJobs();
    showToast('Downloads finalizados limpos da lista', 'info');
  } catch (err) {
    showToast('Erro ao limpar lista', 'error');
  }
}

async function toggleQueuePause() {
  const isPaused = state.stats.isPaused;
  const endpoint = isPaused ? '/api/queue/resume' : '/api/queue/pause';
  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();
    state.stats.isPaused = data.isPaused;
    
    const btn = document.getElementById('btn-pause-queue');
    const label = document.getElementById('btn-pause-label');
    if (data.isPaused) {
      btn.classList.add('bg-amber-600', 'text-white');
      label.textContent = 'Retomar Fila';
      showToast('Fila de downloads pausada', 'info');
    } else {
      btn.classList.remove('bg-amber-600', 'text-white');
      label.textContent = 'Pausar Fila';
      showToast('Fila retomada', 'success');
    }
  } catch (err) {
    showToast('Erro ao alterar estado da fila', 'error');
  }
}

// ==========================================
// LIBRARY MANAGEMENT
// ==========================================
async function loadLibrary() {
  try {
    const res = await fetch('/api/library');
    const items = await res.json();
    state.libraryItems = items || [];
    
    // Update badge in header
    document.getElementById('library-badge-count').textContent = state.libraryItems.length;
    renderLibrary();
  } catch (err) {
    console.error('Falha ao carregar biblioteca:', err);
  }
}

function setLibraryFilter(filter) {
  state.libraryFilter = filter;
  ['all', 'video', 'audio'].forEach(f => {
    const btn = document.getElementById(`lib-filter-${f}`);
    if (btn) {
      if (f === filter) {
        btn.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white shadow transition-all';
      } else {
        btn.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-all';
      }
    }
  });
  renderLibrary();
}

function filterLibrary() {
  renderLibrary();
}

function renderLibrary() {
  const container = document.getElementById('library-container');
  const emptyEl = document.getElementById('library-empty');
  const query = (document.getElementById('library-search')?.value || '').toLowerCase().trim();

  let items = state.libraryItems;

  if (state.libraryFilter !== 'all') {
    items = items.filter(i => i.type === state.libraryFilter);
  }

  if (query) {
    items = items.filter(i => i.name.toLowerCase().includes(query));
  }

  if (items.length === 0) {
    container.innerHTML = '';
    if (emptyEl) container.appendChild(emptyEl);
    return;
  }

  container.innerHTML = items.map(item => {
    const encodedFilename = encodeForInlineArgument(item.name);
    const encodedDisplayName = encodeForInlineArgument(item.name);
    return `
    <div class="glass-panel p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-3">
      <div class="flex items-start space-x-3">
        <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-blue-400">
          <i data-lucide="${item.type === 'audio' ? 'music' : 'film'}" class="w-5 h-5"></i>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center space-x-1.5">
            <span class="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-800 text-slate-300 uppercase">${escapeHtml(item.extension)}</span>
            <span class="text-xs text-slate-400">${escapeHtml(item.sizeFormatted)}</span>
          </div>
          <h4 class="text-sm font-semibold text-white truncate mt-1" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h4>
          <p class="text-[11px] text-slate-500 mt-0.5">${new Date(item.modifiedAt).toLocaleString('pt-BR')}</p>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
        <div class="flex items-center space-x-1">
          <button 
            onclick="openPlayerModal('${item.type}', '${encodedFilename}', '${encodedDisplayName}', '${escapeHtml(item.sizeFormatted)}')"
            class="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-medium flex items-center space-x-1 transition-all"
          >
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
            <span>Reproduzir</span>
          </button>
          
          <a 
            href="${item.downloadUrl}" 
            download="${escapeHtml(item.name)}"
            class="px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 font-medium flex items-center space-x-1 transition-all"
          >
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Baixar</span>
          </a>
        </div>

        <button 
          onclick="deleteLibraryItem('${item.type}', '${encodedFilename}')" 
          class="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
          title="Excluir arquivo"
        >
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `;
  }).join('');

  lucide.createIcons();
}

async function deleteLibraryItem(type, filename) {
  if (!confirm('Deseja realmente excluir este arquivo do disco?')) return;

  try {
    const res = await fetch(`/api/library/${type}/${filename}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Arquivo excluído com sucesso', 'success');
      loadLibrary();
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao excluir arquivo', 'error');
    }
  } catch (err) {
    showToast('Falha na requisição: ' + err.message, 'error');
  }
}

// ==========================================
// MEDIA PLAYER MODAL
// ==========================================
function openPlayerModal(type, encodedFilename, displayName, sizeFormatted = '') {
  const modal = document.getElementById('player-modal');
  const videoPlayer = document.getElementById('html-video-player');
  const audioContainer = document.getElementById('html-audio-container');
  const audioPlayer = document.getElementById('html-audio-player');
  const titleEl = document.getElementById('player-title');
  const sizeEl = document.getElementById('player-filesize');
  const dlLink = document.getElementById('player-download-link');
  const iconEl = document.getElementById('player-type-icon');

  titleEl.textContent = decodeURIComponent(displayName);
  sizeEl.textContent = sizeFormatted ? `Tamanho: ${sizeFormatted}` : '';
  dlLink.href = `/api/library/download/${type}/${encodedFilename}`;
  dlLink.setAttribute('download', decodeURIComponent(encodedFilename));

  const streamUrl = `/api/library/stream/${type}/${encodedFilename}`;

  if (type === 'audio') {
    videoPlayer.classList.add('hidden');
    videoPlayer.pause();
    videoPlayer.src = '';

    audioContainer.classList.remove('hidden');
    audioPlayer.src = streamUrl;
    audioPlayer.play().catch(() => {});
    iconEl.setAttribute('data-lucide', 'music');
  } else {
    audioContainer.classList.add('hidden');
    audioPlayer.pause();
    audioPlayer.src = '';

    videoPlayer.classList.remove('hidden');
    videoPlayer.src = streamUrl;
    videoPlayer.play().catch(() => {});
    iconEl.setAttribute('data-lucide', 'film');
  }

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closePlayerModal() {
  const modal = document.getElementById('player-modal');
  const videoPlayer = document.getElementById('html-video-player');
  const audioPlayer = document.getElementById('html-audio-player');

  videoPlayer.pause();
  videoPlayer.src = '';
  audioPlayer.pause();
  audioPlayer.src = '';

  modal.classList.add('hidden');
}

// ==========================================
// LOG VIEWER MODAL
// ==========================================
async function openLogModal(jobId) {
  state.activeLogJobId = jobId;
  const modal = document.getElementById('log-modal');
  const consoleEl = document.getElementById('log-console');
  const statusEl = document.getElementById('log-job-status');

  consoleEl.textContent = 'Carregando logs do processo...';
  modal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    const job = await res.json();
    consoleEl.textContent = job.logs || 'Aguardando logs do yt-dlp...';
    statusEl.textContent = `Status: ${job.status.toUpperCase()}`;
    scrollToBottomLogs();
  } catch (err) {
    consoleEl.textContent = 'Erro ao buscar logs: ' + err.message;
  }
}

function closeLogModal() {
  state.activeLogJobId = null;
  document.getElementById('log-modal').classList.add('hidden');
}

function scrollToBottomLogs() {
  const checkbox = document.getElementById('log-autoscroll');
  if (checkbox && checkbox.checked) {
    const consoleEl = document.getElementById('log-console');
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

function copyLogsToClipboard() {
  const text = document.getElementById('log-console').textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Logs copiados para a área de transferência!', 'success');
  });
}

// ==========================================
// SYSTEM & SETTINGS
// ==========================================
async function loadSystemInfo() {
  try {
    const res = await fetch('/api/system');
    const data = await res.json();

    document.getElementById('sys-ytdlp').textContent = data.ytdlpVersion || 'Não detectado';
    document.getElementById('sys-ffmpeg').textContent = data.ffmpegVersion || 'Não detectado';
    document.getElementById('sys-node').textContent = `${data.nodeVersion} (${data.platform})`;
    document.getElementById('sys-memory').textContent = `${data.freeMemory} / ${data.totalMemory}`;
    document.getElementById('sys-path-video').textContent = data.storageDirs.video;
    document.getElementById('sys-path-audio').textContent = data.storageDirs.audio;

    // Check if videos.txt exists for batch import banner
    const localBanner = document.getElementById('local-videos-banner');
    if (data.hasVideosTxt) {
      localBanner.classList.remove('hidden');
    } else {
      localBanner.classList.add('hidden');
    }
  } catch (err) {
    console.error('Falha ao carregar informações do sistema:', err);
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();

    document.getElementById('set-concurrency').value = data.concurrency || 2;
    document.getElementById('set-video-format').value = data.defaultVideoFormat || 'mp4';
    document.getElementById('set-audio-format').value = data.defaultAudioFormat || 'mp3';
    document.getElementById('set-audio-quality').value = data.defaultAudioQuality || '192K';
  } catch (err) {
    console.error('Falha ao carregar preferências:', err);
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const concurrency = parseInt(document.getElementById('set-concurrency').value, 10);
  const defaultVideoFormat = document.getElementById('set-video-format').value;
  const defaultAudioFormat = document.getElementById('set-audio-format').value;
  const defaultAudioQuality = document.getElementById('set-audio-quality').value;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concurrency,
        defaultVideoFormat,
        defaultAudioFormat,
        defaultAudioQuality
      })
    });

    if (res.ok) {
      showToast('Preferências salvas com sucesso!', 'success');
    }
  } catch (err) {
    showToast('Falha ao salvar configurações', 'error');
  }
}

async function updateYtDlp() {
  const btn = document.getElementById('btn-update-ytdlp');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i><span>Atualizando...</span>';
  lucide.createIcons();

  try {
    const res = await fetch('/api/system/update-ytdlp', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.output || 'yt-dlp atualizado!', 'success');
      loadSystemInfo();
    } else {
      showToast(data.error || 'Erro ao atualizar yt-dlp', 'error');
    }
  } catch (err) {
    showToast('Falha na requisição: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="arrow-up-circle" class="w-3.5 h-3.5"></i><span>Atualizar Agora</span>';
    lucide.createIcons();
  }
}

// ==========================================
// REAL-TIME SERVER-SENT EVENTS (SSE)
// ==========================================
function setupSSE() {
  const eventSource = new EventSource('/api/events');
  const statusEl = document.getElementById('sse-status');

  eventSource.onopen = () => {
    statusEl.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-500 live-pulse"></span>
      <span class="text-slate-300 hidden md:inline">Servidor Conectado</span>
    `;
  };

  eventSource.onerror = () => {
    statusEl.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-amber-500"></span>
      <span class="text-amber-400 hidden md:inline">Reconectando...</span>
    `;
  };

  eventSource.addEventListener('stats', e => {
    const stats = JSON.parse(e.data);
    updateStats(stats);
  });

  eventSource.addEventListener('job:created', e => {
    const job = JSON.parse(e.data);
    state.jobs.unshift(job);
    renderJobs();
  });

  eventSource.addEventListener('job:started', e => {
    const job = JSON.parse(e.data);
    updateJobInList(job);
  });

  eventSource.addEventListener('job:progress', e => {
    const data = JSON.parse(e.data);
    const job = state.jobs.find(j => j.id === data.jobId);
    if (job) {
      job.progress = data.progress;
      job.speed = data.speed;
      job.eta = data.eta;
      job.total_size = data.totalSize;
      job.downloaded_bytes = data.downloadedBytes;

      // Update DOM directly for smooth 60fps rendering without re-rendering whole card
      const bar = document.getElementById(`job-progress-bar-${job.id}`);
      const text = document.getElementById(`job-progress-text-${job.id}`);
      const speed = document.getElementById(`job-speed-${job.id}`);
      const eta = document.getElementById(`job-eta-${job.id}`);
      const size = document.getElementById(`job-size-${job.id}`);

      if (bar) bar.style.width = `${Math.min(100, Math.max(0, data.progress))}%`;
      if (text) text.textContent = `${data.progress.toFixed(1)}%`;
      if (speed && data.speed) speed.textContent = data.speed;
      if (eta && data.eta) eta.textContent = `ETA: ${data.eta}`;
      if (size && data.totalSize) size.textContent = `${data.downloadedBytes || '0B'} / ${data.totalSize}`;
    }
  });

  eventSource.addEventListener('job:log', e => {
    const { jobId, log } = JSON.parse(e.data);
    if (state.activeLogJobId === jobId) {
      const consoleEl = document.getElementById('log-console');
      consoleEl.textContent += '\n' + log;
      scrollToBottomLogs();
    }
  });

  eventSource.addEventListener('job:completed', e => {
    const job = JSON.parse(e.data);
    updateJobInList(job);
    showToast(`Download concluído: ${job.title || job.file_name || 'Mídia'}`, 'success');
  });

  eventSource.addEventListener('job:failed', e => {
    const job = JSON.parse(e.data);
    updateJobInList(job);
    showToast(`Falha no download: ${job.title || job.url}`, 'error');
  });

  eventSource.addEventListener('job:cancelled', e => {
    const job = JSON.parse(e.data);
    updateJobInList(job);
  });

  eventSource.addEventListener('job:updated', e => {
    const job = JSON.parse(e.data);
    updateJobInList(job);
  });

  eventSource.addEventListener('library:changed', () => {
    loadLibrary();
  });
}

function updateJobInList(job) {
  const index = state.jobs.findIndex(j => j.id === job.id);
  if (index !== -1) {
    state.jobs[index] = job;
  } else {
    state.jobs.unshift(job);
  }
  renderJobs();
}

// ==========================================
// DRAG AND DROP SETUP
// ==========================================
function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('border-blue-500', 'bg-blue-950/20');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('border-blue-500', 'bg-blue-950/20');
    }, false);
  });

  dropZone.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFileUpload({ target: { files } });
    }
  });
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  setupSSE();
  setupDragAndDrop();
  loadJobs();
  loadLibrary();
  loadSystemInfo();
});
