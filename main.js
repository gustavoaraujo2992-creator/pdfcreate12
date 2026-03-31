import api from './api.js';
import auth from './auth.js';
import state from './state.js';
import * as ui from './ui.js';
import { SheetsService } from './sheets-service.js';

const sheets = new SheetsService();

// ─── Auth Initialization ──────────────────────────────────────
if (auth.isLoggedIn()) {
  ui.showUploadView();
  // Auto-load data from sheets if already logged in
  loadFromSheets();
} else {
  ui.showLoginView();
}

ui.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;

  if (await auth.login(u, p)) {
    ui.showUploadView();
    // Auto-load data from sheets after login
    loadFromSheets();
  } else {
    ui.loginError.style.display = 'block';
  }
});

ui.logoutBtn.addEventListener('click', () => {
  auth.logout();
});

// ─── Upload Events ────────────────────────────────────────────
ui.dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  ui.dropzone.classList.add('dragover');
});

ui.dropzone.addEventListener('dragleave', () => {
  ui.dropzone.classList.remove('dragover');
});

ui.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  ui.dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    const validFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    processFiles(validFiles);
  }
});

ui.fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    const validFiles = Array.from(e.target.files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    processFiles(validFiles);
  }
});

// ─── Dashboard Events ─────────────────────────────────────────
ui.searchInput.addEventListener('input', () => {
  renderTable();
});

ui.sectorFilter.addEventListener('change', () => {
  renderTable();
});

ui.toggleRawBtn.addEventListener('click', () => {
  const isHidden = ui.rawOutput.style.display === 'none';
  ui.rawOutput.style.display = isHidden ? 'block' : 'none';
  ui.toggleRawBtn.textContent = isHidden ? '▼ Ocultar texto bruto' : '▶ Ver texto bruto extraído';
});

ui.addFileBtn.addEventListener('click', () => {
  ui.fileInput.click();
});

ui.exportCSVBtn.addEventListener('click', exportCSV);

ui.newFileBtn.addEventListener('click', () => {
  ui.showUploadView();
  ui.loadingSection.style.display = 'none';
  ui.fileInput.value = '';

  // Reset state
  state.resetState();
});

ui.syncSheetsBtn.addEventListener('click', syncWithSheets);
ui.loadSheetsBtn.addEventListener('click', loadFromSheets);

// ─── Edit Modal Events ────────────────────────────────────────
ui.addPersonBtn.addEventListener('click', () => {
  document.getElementById('editIndex').value = '-1'; // -1 significa "Novo Registro"
  document.getElementById('editName').value = '';
  document.getElementById('editCPF').value = '';
  // Se houver um setor filtrado, já preenche pra facilitar, senão GERAL
  document.getElementById('editSector').value = ui.sectorFilter.value || 'GERAL';
  document.getElementById('editService').value = 'GERAL';
  document.getElementById('editTime').value = '';
  ui.editModal.style.display = 'flex';
});

ui.cancelEdit.addEventListener('click', () => {
  ui.editModal.style.display = 'none';
});

ui.editForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const index = parseInt(document.getElementById('editIndex').value);
  const sectorValue = document.getElementById('editSector').value.toUpperCase();
  const currentData = state.getState();

  if (index === -1) {
    // Inserir novo registro (Encaixe)
    currentData.equipe.push({
      nome: document.getElementById('editName').value.toUpperCase(),
      cpf: document.getElementById('editCPF').value,
      setor: sectorValue,
      servico: document.getElementById('editService').value.toUpperCase(),
      horario: document.getElementById('editTime').value,
      status: 'Encaixe Manual',
      arquivo: 'Inserção Manual'
    });
  } else {
    // Atualizar registro existente
    currentData.equipe[index].nome = document.getElementById('editName').value.toUpperCase();
    currentData.equipe[index].cpf = document.getElementById('editCPF').value;
    currentData.equipe[index].setor = sectorValue;
    currentData.equipe[index].servico = document.getElementById('editService').value.toUpperCase();
    currentData.equipe[index].horario = document.getElementById('editTime').value;
  }

  // Atualizar setores caso um setor novo tenha sido digitado
  currentData.setores.add(sectorValue);
  state.setState(currentData);

  // Atualizar o menu dropdown de filtro de setores
  const setoresArr = Array.from(currentData.setores).sort();
  const currentFilterVal = ui.sectorFilter.value;
  ui.sectorFilter.innerHTML = '<option value="">Todos os Setores</option>';
  setoresArr.forEach(setor => {
    const opt = document.createElement('option');
    opt.value = setor;
    opt.textContent = setor;
    ui.sectorFilter.appendChild(opt);
  });
  ui.sectorFilter.value = currentFilterVal; // Mantém o filtro selecionado

  ui.editModal.style.display = 'none';
  renderTable();
  updateStatsBar();
});

// ─── Process Files (Batch) ────────────────────────────────────
async function processFiles(files) {
  if (files.length === 0) {
    alert('Nenhum arquivo (PDF ou Excel) selecionado.');
    return;
  }

  const manualSector = ui.defaultSectorInput.value.trim().toUpperCase();
  ui.loadingSection.style.display = 'block';
  const currentData = state.getState();
  const isIncremental = currentData.equipe.length > 0;
  if (!isIncremental) {
    state.resetState();
  }

  let successCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    ui.statusMessage.style.color = '#94a3b8';
    ui.statusMessage.textContent = `🚀 Processando arquivo ${i + 1} de ${files.length}...\n${file.name}`;

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const data = await api.extract(formData);

      if (data.success && data.parsed && data.parsed.equipe.length > 0) {
        successCount++;
        const newData = state.getState();
        if (data.parsed.data_referencia) newData.datas.add(data.parsed.data_referencia);
        newData.totalPages += (data.pages || 0);
        newData.rawTexts.push(`--- ARQUIVO: ${file.name} ---\n${data.rawText || ''}`);

        const sectorFromName = getSectorFromFilename(file.name);

        for (const p of data.parsed.equipe) {
          // Precedence: 1. Manual User Input (highest), 2. Filename Extraction, 3. PDF Content data, 4. Default
          const finalSector = manualSector || sectorFromName || p.setor || data.parsed.setor || 'NA HORA CEILÂNDIA';

          newData.setores.add(finalSector);
          newData.equipe.push({
            ...p,
            setor: finalSector,
            arquivo: file.name
          });
        }
        state.setState(newData);
      }
    } catch (error) {
      console.error(`Falha ao enviar ${file.name}:`, error);
    }
  }

  if (state.getState().equipe.length === 0) {
    ui.statusMessage.style.color = '#ef4444';
    ui.statusMessage.innerHTML = '<strong>❌ Falha:</strong> Nenhum dado estruturado pôde ser extraído dos arquivos selecionados.';
    return;
  }

  const finalData = state.getState();
  finalData.equipe.sort((a, b) => {
    if (a.setor !== b.setor) return a.setor.localeCompare(b.setor);
    return a.nome.localeCompare(b.nome);
  });
  state.setState(finalData);

  showDashboard();
}

// ─── Dashboard Logic ──────────────────────────────────────────
function showDashboard() {
  ui.showDashboardView();

  // Pre-fill metadata sector if manual sector was used
  if (ui.defaultSectorInput.value.trim()) {
    ui.sheetSectorInput.value = ui.defaultSectorInput.value.trim().toUpperCase();
  }

  updateStatsBar();
  const currentData = state.getState();

  // Populate Sector Filter Dropdown
  const setoresArr = Array.from(currentData.setores).sort();
  ui.sectorFilter.innerHTML = '<option value="">Todos os Setores</option>';
  setoresArr.forEach(setor => {
    const opt = document.createElement('option');
    opt.value = setor;
    opt.textContent = setor;
    ui.sectorFilter.appendChild(opt);
  });

  ui.rawOutput.querySelector('code').textContent = currentData.rawTexts.join('\n\n');
  ui.searchInput.value = '';
  ui.sectorFilter.value = '';
  renderTable();
}

function updateStatsBar() {
  const currentData = state.getState();
  ui.statTotal.textContent = currentData.equipe.length;
  const setoresArr = Array.from(currentData.setores);
  ui.statSetor.textContent = setoresArr.length === 1 ? setoresArr[0] : `${setoresArr.length} Setores`;
  const datasArr = Array.from(currentData.datas);
  ui.statData.textContent = datasArr.length === 1 ? datasArr[0] : (datasArr.length > 1 ? `${datasArr.length} Datas` : '—');
  ui.statPages.textContent = currentData.totalPages;
}

function renderTable() {
  const currentData = state.getState();
  if (!currentData || currentData.equipe.length === 0) return;

  const query = ui.searchInput.value.trim().toLowerCase().replace(/[.\-]/g, '');
  const selectedSector = ui.sectorFilter.value;

  const filtered = currentData.equipe.map((p, originalIdx) => ({ ...p, originalIdx })).filter(p => {
    let matchText = true;
    if (query) matchText = p.nome.toLowerCase().includes(query) || p.cpf.replace(/[.\-]/g, '').includes(query);
    let matchSector = true;
    if (selectedSector) matchSector = (p.setor === selectedSector);
    return matchText && matchSector;
  });

  ui.searchCount.textContent = `${filtered.length} de ${currentData.equipe.length} registros`;

  if (filtered.length === 0) {
    ui.noResults.style.display = 'block';
    document.getElementById('resultsTable').style.display = 'none';
    return;
  }

  ui.noResults.style.display = 'none';
  document.getElementById('resultsTable').style.display = 'table';

  ui.tableBody.innerHTML = filtered.map((person, idx) => {
    const nome = highlightMatch(person.nome, query);
    const cpf = highlightMatch(person.cpf, query);
    const statusClass = person.status.includes('OCR') ? 'badge-warning' : 'badge-success';

    return `<tr>
        <td>${idx + 1}</td>
        <td><strong>${nome}</strong><br><small style="color:#64748b;">${person.arquivo}</small></td>
        <td>${cpf}</td>
        <td><span class="badge" style="background: rgba(99,102,241,0.15); color: #818cf8;">${person.setor}</span></td>
        <td style="font-size: 0.8rem; color: #94a3b8;">${person.servico || 'GERAL'}</td>
        <td>${person.horario || '<span style="color:#64748b;">--:--</span>'}</td>
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
  const currentData = state.getState();
  const person = currentData.equipe[index];
  document.getElementById('editIndex').value = index;
  document.getElementById('editName').value = person.nome;
  document.getElementById('editCPF').value = person.cpf;
  document.getElementById('editSector').value = person.setor;
  document.getElementById('editService').value = person.servico || 'GERAL';
  document.getElementById('editTime').value = person.horario || '';
  ui.editModal.style.display = 'flex';
}

async function syncWithSheets() {
  const currentData = state.getState();
  if (currentData.equipe.length === 0) return;

  if (!sheets.scriptUrl) {
    const url = prompt('Cole aqui a URL do seu Web App do Google Apps Script:');
    if (!url) return;
    sheets.setScriptUrl(url);
  }

  const metadata = {
    name: ui.sheetNameInput.value || 'Extração PDFNice',
    reason: ui.sheetReasonInput.value || 'Backup Automático',
    sector: ui.sheetSectorInput.value || 'Geral',
    date: Array.from(currentData.datas)[0] || 'N/A'
  };

  ui.syncSheetsBtn.disabled = true;
  ui.syncSheetsBtn.textContent = '🔄 Sincronizando...';

  try {
    await sheets.saveExtraction(metadata, currentData.equipe);
    alert('Sincronização concluída com sucesso no Google Sheets!');
  } catch (error) {
    alert('Erro ao sincronizar: ' + error.message);
  } finally {
    ui.syncSheetsBtn.disabled = false;
    ui.syncSheetsBtn.textContent = '☁️ Sincronizar Google Sheets';
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
      state.resetState();
      const newData = state.getState();

      rows.forEach(row => {
        const [ts, sheet, reason, sector, date, nome, cpf, horario, servico, status] = row;

        newData.equipe.push({
          nome: nome,
          cpf: cpf,
          setor: sector,
          servico: servico,
          horario: horario,
          status: status,
          arquivo: sheet // Using sheet name as the source
        });

        newData.setores.add(sector);
        if (date) newData.datas.add(date);
      });

      state.setState(newData);
      showDashboard();
      console.log(`[Sheets] ${newData.equipe.length} registros carregados.`);
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
    const currentData = state.getState();
  if (!currentData || currentData.equipe.length === 0) return;
  const query = ui.searchInput.value.trim().toLowerCase().replace(/[.\-]/g, '');
  const selectedSector = ui.sectorFilter.value;
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
function getSectorFromFilename(name) {
  const clean = name.replace(/\.pdf$/i, '').replace(/\.xlsx?$/i, '').replace(/[-_]/g, ' ').toUpperCase();
  if (clean.includes('CEILANDIA')) return 'NA HORA CEILÂNDIA';
  if (clean.includes('GAMA')) return 'NA HORA GAMA';
  if (clean.includes('TAGUATINGA')) return 'NA HORA TAGUA';
  if (clean.includes('RODOVIARIA')) return 'NA HORA RODOVIÁRIA';
  return null;
}
// ─── Add skip to dashboard button event (if we had it in HTML)
document.addEventListener('click', (e) => {
    if (e.target.id === 'viewDashboardBtn') {
        showDashboard();
    }
});
