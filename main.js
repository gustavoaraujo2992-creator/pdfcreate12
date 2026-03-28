// ─── PDFNice Frontend — Dashboard Edition (Multi-File) ────────
import { SheetsService } from './sheets-service.js';

const SERVER_URL = window.location.hostname === 'localhost' && window.location.port === '5173' 
    ? 'http://localhost:3001' 
    : ''; // In production, API is on the same host

const sheets = new SheetsService();

// ─── DOM Elements ─────────────────────────────────────────────
const loginView = document.getElementById('loginView');
const uploadView = document.getElementById('uploadView');
const dashboardView = document.getElementById('dashboardView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const loadingSection = document.getElementById('loadingSection');
const statusMessage = document.getElementById('statusMessage');
const defaultSectorInput = document.getElementById('defaultSectorInput'); // New

// Dashboard elements
const searchInput = document.getElementById('searchInput');
const sectorFilter = document.getElementById('sectorFilter');
const searchCount = document.getElementById('searchCount');
const tableBody = document.getElementById('tableBody');
const noResults = document.getElementById('noResults');
const toggleRawBtn = document.getElementById('toggleRawBtn');
const rawOutput = document.getElementById('rawOutput');
const addFileBtn = document.getElementById('addFileBtn');
const exportCSVBtn = document.getElementById('exportCSVBtn');
const newFileBtn = document.getElementById('newFileBtn');
const syncSheetsBtn = document.getElementById('syncSheetsBtn');
const loadSheetsBtn = document.createElement('button'); // Temporarily dynamic until I update index.html
loadSheetsBtn.id = 'loadSheetsBtn';
loadSheetsBtn.className = 'btn-action btn-outline';
loadSheetsBtn.textContent = '📥 Carregar do Sheets';
document.querySelector('.topbar-right').insertBefore(loadSheetsBtn, exportCSVBtn);

const logoutBtn = document.getElementById('logoutBtn');

// Metadata fields
const sheetNameInput = document.getElementById('sheetNameInput');
const sheetReasonInput = document.getElementById('sheetReasonInput');
const sheetSectorInput = document.getElementById('sheetSectorInput');

// Edit Modal
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const cancelEdit = document.getElementById('cancelEdit');

// Stats
const statTotal = document.getElementById('statTotal');
const statSetor = document.getElementById('statSetor');
const statData = document.getElementById('statData');
const statPages = document.getElementById('statPages');

// ─── State ────────────────────────────────────────────────────
let currentData = {
    equipe: [],
    setores: new Set(),
    datas: new Set(),
    totalPages: 0,
    rawTexts: []
};

// ─── Auth Initialization ──────────────────────────────────────
const session = sessionStorage.getItem('nhce_session');
if (session === 'active') {
    loginView.style.display = 'none';
    uploadView.style.display = 'flex';
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;

    if (u === 'nhce' && p === 'nhce') {
        sessionStorage.setItem('nhce_session', 'active');
        loginView.style.display = 'none';
        uploadView.style.display = 'flex';
        // Auto-load data from sheets after login
        loadFromSheets();
    } else {
        loginError.style.display = 'block';
    }
});

logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('nhce_session');
    location.reload();
});

// ─── Upload Events ────────────────────────────────────────────
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        const validFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        processFiles(validFiles);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const validFiles = Array.from(e.target.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        processFiles(validFiles);
    }
});

// ─── Dashboard Events ─────────────────────────────────────────
searchInput.addEventListener('input', () => {
    renderTable();
});

sectorFilter.addEventListener('change', () => {
    renderTable();
});

toggleRawBtn.addEventListener('click', () => {
    const isHidden = rawOutput.style.display === 'none';
    rawOutput.style.display = isHidden ? 'block' : 'none';
    toggleRawBtn.textContent = isHidden ? '▼ Ocultar texto bruto' : '▶ Ver texto bruto extraído';
});

addFileBtn.addEventListener('click', () => {
    fileInput.click();
});

exportCSVBtn.addEventListener('click', exportCSV);

newFileBtn.addEventListener('click', () => {
    dashboardView.style.display = 'none';
    uploadView.style.display = 'flex';
    loadingSection.style.display = 'none';
    fileInput.value = '';
    
    // Reset state
    currentData = {
        equipe: [],
        setores: new Set(),
        datas: new Set(),
        totalPages: 0,
        rawTexts: []
    };
});

syncSheetsBtn.addEventListener('click', syncWithSheets);
loadSheetsBtn.addEventListener('click', loadFromSheets);

// ─── Edit Modal Events ────────────────────────────────────────
cancelEdit.addEventListener('click', () => {
    editModal.style.display = 'none';
});

editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const index = parseInt(document.getElementById('editIndex').value);
    
    // Update data in state
    currentData.equipe[index].nome = document.getElementById('editName').value.toUpperCase();
    currentData.equipe[index].cpf = document.getElementById('editCPF').value;
    currentData.equipe[index].setor = document.getElementById('editSector').value.toUpperCase();
    currentData.equipe[index].servico = document.getElementById('editService').value.toUpperCase();
    currentData.equipe[index].horario = document.getElementById('editTime').value;

    // Refresh sets if sector changed
    currentData.setores.add(currentData.equipe[index].setor);
    
    editModal.style.display = 'none';
    renderTable();
    updateStatsBar();
});

// ─── Process Files (Batch) ────────────────────────────────────
async function processFiles(files) {
    if (files.length === 0) {
        alert('Nenhum arquivo PDF válido selecionado.');
        return;
    }

    const manualSector = defaultSectorInput.value.trim().toUpperCase();
    loadingSection.style.display = 'block';
    const isIncremental = currentData.equipe.length > 0;
    if (!isIncremental) {
        currentData = { equipe: [], setores: new Set(), datas: new Set(), totalPages: 0, rawTexts: [] };
    }
    
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        statusMessage.style.color = '#94a3b8';
        statusMessage.textContent = `🚀 Processando arquivo ${i + 1} de ${files.length}...\n${file.name}`;

        try {
            const formData = new FormData();
            formData.append('pdf', file);

            const response = await fetch(`${SERVER_URL}/api/extract`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) continue;

            const data = await response.json();

            if (data.success && data.parsed && data.parsed.equipe.length > 0) {
                successCount++;
                if (data.parsed.data_referencia) currentData.datas.add(data.parsed.data_referencia);
                currentData.totalPages += (data.pages || 0);
                currentData.rawTexts.push(`--- ARQUIVO: ${file.name} ---\n${data.rawText || ''}`);

                const sectorFromName = getSectorFromFilename(file.name);

                for (const p of data.parsed.equipe) {
                    // Precedence: 1. Manual User Input (highest), 2. Filename Extraction, 3. PDF Content data, 4. Default
                    const finalSector = manualSector || sectorFromName || p.setor || data.parsed.setor || 'NA HORA CEILÂNDIA';
                    
                    currentData.setores.add(finalSector);
                    currentData.equipe.push({
                        ...p,
                        setor: finalSector,
                        arquivo: file.name
                    });
                }
            }
        } catch (error) {
            console.error(`Falha ao enviar ${file.name}:`, error);
        }
    }

    if (currentData.equipe.length === 0) {
        statusMessage.style.color = '#ef4444';
        statusMessage.innerHTML = '<strong>❌ Falha:</strong> Nenhum dado estruturado pôde ser extraído dos arquivos selecionados.';
        return;
    }

    currentData.equipe.sort((a, b) => {
        if (a.setor !== b.setor) return a.setor.localeCompare(b.setor);
        return a.nome.localeCompare(b.nome);
    });

    showDashboard();
}

// ─── Dashboard Logic ──────────────────────────────────────────
function showDashboard() {
    uploadView.style.display = 'none';
    dashboardView.style.display = 'block';

    // Pre-fill metadata sector if manual sector was used
    if (defaultSectorInput.value.trim()) {
        sheetSectorInput.value = defaultSectorInput.value.trim().toUpperCase();
    }

    updateStatsBar();

    // Populate Sector Filter Dropdown
    const setoresArr = Array.from(currentData.setores).sort();
    sectorFilter.innerHTML = '<option value="">Todos os Setores</option>';
    setoresArr.forEach(setor => {
        const opt = document.createElement('option');
        opt.value = setor;
        opt.textContent = setor;
        sectorFilter.appendChild(opt);
    });

    rawOutput.querySelector('code').textContent = currentData.rawTexts.join('\n\n');
    searchInput.value = '';
    sectorFilter.value = '';
    renderTable();
}

function updateStatsBar() {
    statTotal.textContent = currentData.equipe.length;
    const setoresArr = Array.from(currentData.setores);
    statSetor.textContent = setoresArr.length === 1 ? setoresArr[0] : `${setoresArr.length} Setores`;
    const datasArr = Array.from(currentData.datas);
    statData.textContent = datasArr.length === 1 ? datasArr[0] : (datasArr.length > 1 ? `${datasArr.length} Datas` : '—');
    statPages.textContent = currentData.totalPages;
}

function renderTable() {
    if (!currentData || currentData.equipe.length === 0) return;

    const query = searchInput.value.trim().toLowerCase().replace(/[.\-]/g, '');
    const selectedSector = sectorFilter.value;

    const filtered = currentData.equipe.map((p, originalIdx) => ({ ...p, originalIdx })).filter(p => {
        let matchText = true;
        if (query) matchText = p.nome.toLowerCase().includes(query) || p.cpf.replace(/[.\-]/g, '').includes(query);
        let matchSector = true;
        if (selectedSector) matchSector = (p.setor === selectedSector);
        return matchText && matchSector;
    });

    searchCount.textContent = `${filtered.length} de ${currentData.equipe.length} registros`;

    if (filtered.length === 0) {
        noResults.style.display = 'block';
        document.getElementById('resultsTable').style.display = 'none';
        return;
    }

    noResults.style.display = 'none';
    document.getElementById('resultsTable').style.display = 'table';

    tableBody.innerHTML = filtered.map((person, idx) => {
        const nome = highlightMatch(person.nome, query);
        const cpf = highlightMatch(person.cpf, query);
        const statusClass = person.status.includes('OCR') ? 'badge-warning' : 'badge-success';

        return `<tr>
            <td>${idx + 1}</td>
            <td><strong>${nome}</strong><br><small style="color:#64748b;">${person.arquivo}</small></td>
            <td>${cpf}</td>
            <td><span class="badge" style="background: rgba(99,102,241,0.15); color: #818cf8;">${person.setor}</span></td>
            <td style="font-size: 0.8rem; color: #94a3b8;">${person.servico || 'GERAL'}</td>
            <td>${person.horario}</td>
            <td><span class="badge ${statusClass}">${person.status}</span></td>
            <td><button class="btn-edit-row" data-idx="${person.originalIdx}">Editar</button></td>
        </tr>`;
    }).join('');

    // Attach edit events once
    document.querySelectorAll('.btn-edit-row').forEach(btn => {
        btn.addEventListener('click', (e) => {
            openEditModal(parseInt(e.target.dataset.idx));
        });
    });
}

function openEditModal(index) {
    const person = currentData.equipe[index];
    document.getElementById('editIndex').value = index;
    document.getElementById('editName').value = person.nome;
    document.getElementById('editCPF').value = person.cpf;
    document.getElementById('editSector').value = person.setor;
    document.getElementById('editService').value = person.servico || 'GERAL';
    document.getElementById('editTime').value = person.horario;
    editModal.style.display = 'flex';
}

async function syncWithSheets() {
    if (currentData.equipe.length === 0) return;

    if (!sheets.scriptUrl) {
        const url = prompt('Cole aqui a URL do seu Web App do Google Apps Script:');
        if (!url) return;
        sheets.setScriptUrl(url);
    }

    const metadata = {
        name: sheetNameInput.value || 'Extração PDFNice',
        reason: sheetReasonInput.value || 'Backup Automático',
        sector: sheetSectorInput.value || 'Geral',
        date: Array.from(currentData.datas)[0] || 'N/A'
    };

    syncSheetsBtn.disabled = true;
    syncSheetsBtn.textContent = '🔄 Sincronizando...';

    try {
        await sheets.saveExtraction(metadata, currentData.equipe);
        alert('Sincronização concluída com sucesso no Google Sheets!');
    } catch (error) {
        alert('Erro ao sincronizar: ' + error.message);
    } finally {
        syncSheetsBtn.disabled = false;
        syncSheetsBtn.textContent = '☁️ Sincronizar Google Sheets';
    }
}
async function loadFromSheets() {
    try {
        console.log('[Sheets] Buscando dados atualizados...');
        const response = await sheets.fetchLatest();
        
        if (response && response.data && response.data.length > 0) {
            // Map the flat array from Sheets back to the person object structure
            // Row format: [Timestamp, Planilha, Motivo, Setor, Data Ref, Nome, CPF, Horário, Serviço, Status]
            const rows = response.data;
            
            // Reconstruct state
            currentData = { equipe: [], setores: new Set(), datas: new Set(), totalPages: 0, rawTexts: [] };
            
            rows.forEach(row => {
               const [ts, sheet, reason, sector, date, nome, cpf, horario, servico, status] = row;
               
               currentData.equipe.push({
                   nome: nome,
                   cpf: cpf,
                   setor: sector,
                   servico: servico,
                   horario: horario,
                   status: status,
                   arquivo: sheet // Using sheet name as the source
               });
               
               currentData.setores.add(sector);
               if (date) currentData.datas.add(date);
            });
            
            showDashboard();
            console.log(`[Sheets] ${currentData.equipe.length} registros carregados.`);
        }
    } catch (error) {
        console.warn('[Sheets] Não foi possível carregar o histórico automático.', error);
    }
}

// ─── Highlight Search Match ───────────────────────────────────
function highlightMatch(text, query) {
    if (!query || !text) return text;
    const cleanQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cleanText = text.replace(/[.\-]/g, '');
    const idx = cleanText.toLowerCase().indexOf(cleanQuery);
    if (idx === -1) return text;
    let origStart = 0, cleanCount = 0;
    for (let i = 0; i < text.length; i++) {
        if (cleanCount === idx) { origStart = i; break; }
        if (!/[.\-]/.test(text[i])) cleanCount++;
    }
    let origEnd = origStart, matchCleanCount = 0;
    for (let i = origStart; i < text.length && matchCleanCount < cleanQuery.length; i++) {
        origEnd = i + 1;
        if (!/[.\-]/.test(text[i])) matchCleanCount++;
    }
    return text.substring(0, origStart) + '<mark>' + text.substring(origStart, origEnd) + '</mark>' + text.substring(origEnd);
}

// ─── Export CSV ───────────────────────────────────────────────
function exportCSV() {
    if (!currentData || currentData.equipe.length === 0) return;
    const query = searchInput.value.trim().toLowerCase().replace(/[.\-]/g, '');
    const selectedSector = sectorFilter.value;
    const filtered = currentData.equipe.filter(p => {
        let matchText = true;
        if (query) matchText = p.nome.toLowerCase().includes(query) || p.cpf.replace(/[.\-]/g, '').includes(query);
        let matchSector = true;
        if (selectedSector) matchSector = (p.setor === selectedSector);
        return matchText && matchSector;
    });
    const headers = ['#', 'Nome', 'CPF', 'Setor/Unidade', 'Serviço', 'Horário', 'Status', 'Arquivo Origem'];
    const rows = filtered.map((p, i) => [i + 1, `"${p.nome}"`, `"${p.cpf}"`, `"${p.setor}"`, `"${p.servico || 'GERAL'}"`, p.horario, p.status, `"${p.arquivo}"`]);
    const csvContent = ['\ufeff\n', headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sectorName = selectedSector ? selectedSector.replace(/\s+/g, '_') : 'MultiSectores';
    a.download = `Escalas_${sectorName}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Utility: Extract Sector from Filename ────────────────────
function getSectorFromFilename(filename) {
    const match = filename.match(/Agenda\s+([A-Za-zÀ-ü]+)/i);
    if (match) {
        let name = match[1].toUpperCase();
        if (name.length > 2) return name;
    }
    const clean = filename.replace(/\.pdf$/i, '').replace(/Agenda/i, '').replace(/[\d\-\_\/\.]/g, '').trim().toUpperCase();
    return clean.length >= 2 ? clean : null;
}
