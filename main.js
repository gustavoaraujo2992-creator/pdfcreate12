// ─── PDFNice Frontend — Dashboard Edition (Multi-File) ────────
const SERVER_URL = window.location.hostname === 'localhost' && window.location.port === '5173' 
    ? 'http://localhost:3001' 
    : ''; // In production, API is on the same host

// ─── DOM Elements ─────────────────────────────────────────────
const uploadView = document.getElementById('uploadView');
const dashboardView = document.getElementById('dashboardView');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const loadingSection = document.getElementById('loadingSection');
const statusMessage = document.getElementById('statusMessage');

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
    fileInput.click(); // Triggers the same file input, but logic in change event will handle it
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

// ─── Process Files (Batch) ────────────────────────────────────
async function processFiles(files) {
    if (files.length === 0) {
        alert('Nenhum arquivo PDF válido selecionado.');
        return;
    }

    loadingSection.style.display = 'block';
    
    // Check if we already have data (incremental mode)
    const isIncremental = currentData.equipe.length > 0;
    
    // If not incremental, reset state. If incremental, we just keep adding.
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

            if (!response.ok) {
                console.error(`Erro no arquivo ${file.name}`);
                continue;
            }

            const data = await response.json();

            if (data.success && data.parsed && data.parsed.equipe.length > 0) {
                successCount++;
                
                if (data.parsed.data_referencia) currentData.datas.add(data.parsed.data_referencia);
                currentData.totalPages += (data.pages || 0);
                currentData.rawTexts.push(`--- ARQUIVO: ${file.name} ---\n${data.rawText || ''}`);

                // Extract sector from filename (e.g., "Agenda Detran..." -> "DETRAN")
                const sectorFromName = getSectorFromFilename(file.name);

                // Add to aggregate list
                for (const p of data.parsed.equipe) {
                    // Use filename as the definitive source of truth for the Sector, avoiding OCR confusion.
                    const finalSector = sectorFromName || p.setor || data.parsed.setor || 'NA HORA CEILÂNDIA';
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

    // Sort by Sector, then by Name
    currentData.equipe.sort((a, b) => {
        if (a.setor !== b.setor) return a.setor.localeCompare(b.setor);
        return a.nome.localeCompare(b.nome);
    });

    showDashboard();
}

// ─── Show Dashboard ───────────────────────────────────────────
function showDashboard() {
    uploadView.style.display = 'none';
    dashboardView.style.display = 'block';

    // Fill stats
    statTotal.textContent = currentData.equipe.length;
    
    // Formatted sector text
    const setoresArr = Array.from(currentData.setores);
    if (setoresArr.length === 1) statSetor.textContent = setoresArr[0];
    else statSetor.textContent = `${setoresArr.length} Setores`;

    // Formatted date text
    const datasArr = Array.from(currentData.datas);
    if (datasArr.length === 1) statData.textContent = datasArr[0];
    else if (datasArr.length > 1) statData.textContent = `${datasArr.length} Datas`;
    else statData.textContent = '—';

    statPages.textContent = currentData.totalPages;

    // Populate Sector Filter Dropdown
    sectorFilter.innerHTML = '<option value="">Todos os Setores</option>';
    setoresArr.sort().forEach(setor => {
        const opt = document.createElement('option');
        opt.value = setor;
        opt.textContent = setor;
        sectorFilter.appendChild(opt);
    });

    // Fill raw text
    rawOutput.querySelector('code').textContent = currentData.rawTexts.join('\n\n');

    // Reset filters and render
    searchInput.value = '';
    sectorFilter.value = '';
    renderTable();
}

// ─── Render Table ─────────────────────────────────────────────
function renderTable() {
    if (!currentData || currentData.equipe.length === 0) return;

    const query = searchInput.value.trim().toLowerCase().replace(/[.\-]/g, '');
    const selectedSector = sectorFilter.value;

    const filtered = currentData.equipe.filter(p => {
        // Search text check
        let matchText = true;
        if (query) {
            const nameMatch = p.nome.toLowerCase().includes(query);
            const cpfMatch = p.cpf.replace(/[.\-]/g, '').includes(query);
            matchText = nameMatch || cpfMatch;
        }
        
        // Sector check
        let matchSector = true;
        if (selectedSector) {
            matchSector = (p.setor === selectedSector);
        }

        return matchText && matchSector;
    });

    // Update count
    searchCount.textContent = `${filtered.length} de ${currentData.equipe.length} registros`;

    if (filtered.length === 0) {
        noResults.style.display = 'block';
        document.getElementById('resultsTable').style.display = 'none';
        return;
    }

    noResults.style.display = 'none';
    document.getElementById('resultsTable').style.display = 'table';

    // Build rows
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
        </tr>`;
    }).join('');
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

    return text.substring(0, origStart) +
           '<mark>' + text.substring(origStart, origEnd) + '</mark>' +
           text.substring(origEnd);
}

// ─── Export CSV ───────────────────────────────────────────────
function exportCSV() {
    if (!currentData || currentData.equipe.length === 0) return;

    // Use currently filtered data or all data? Usually user expects filtered data to be exported.
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
    const rows = filtered.map((p, i) => [
        i + 1,
        `"${p.nome}"`,
        `"${p.cpf}"`,
        `"${p.setor}"`,
        `"${p.servico || 'GERAL'}"`,
        p.horario,
        p.status,
        `"${p.arquivo}"`
    ]);

    const csvContent = [
        '\ufeff\n', // UTF-8 BOM
        headers.join(';'),
        ...rows.map(r => r.join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Nice filename
    const sectorName = selectedSector ? selectedSector.replace(/\s+/g, '_') : 'MultiSectores';
    a.download = `Escalas_${sectorName}_${Date.now()}.csv`;
    
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Utility: Extract Sector from Filename ────────────────────
function getSectorFromFilename(filename) {
    // Ex: "Agenda Detran 25-03.pdf" -> "Detran"
    const match = filename.match(/Agenda\s+([A-Za-zÀ-ü]+)/i);
    if (match) {
        let name = match[1].toUpperCase();
        // Fallback for short words if it captured wrongly
        if (name.length > 2) return name;
    }
    
    // Fallback: clean the filename removing extension and numbers
    const clean = filename.replace(/\.pdf$/i, '')
                          .replace(/Agenda/i, '')
                          .replace(/[\d\-\_\/\.]/g, '')
                          .trim()
                          .toUpperCase();
    
    return clean.length >= 2 ? clean : null;
}

console.log('[PDFNice] Batch Dashboard com Nome de Arquivo pronto. Servidor:', SERVER_URL);
