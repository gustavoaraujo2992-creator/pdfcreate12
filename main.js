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
    const validFiles = Array.from(e.dataTransfer.files).filter(f => {
      const name = f.name.toLowerCase();
      return f.type === 'application/pdf' || name.endsWith('.pdf') || name.endsWith('.xls') || name.endsWith('.xlsx');
    });
    processFiles(validFiles);
  }
});

ui.fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    const validFiles = Array.from(e.target.files).filter(f => {
      const name = f.name.toLowerCase();
      return f.type === 'application/pdf' || name.endsWith('.pdf') || name.endsWith('.xls') || name.endsWith('.xlsx');
    });
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
          const fileUpper = file.name.toUpperCase();
          newData.setores.add(fileUpper);
          newData.equipe.push({
            ...p,
            setor: fileUpper, 
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

// ─── Utility: Normalize Text (Remove Accents) ──────────────────
function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFD') // Decompor caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remover marcas de acentuação
    .toLowerCase();
}

function renderTable() {
  const currentData = state.getState();
  if (!currentData || currentData.equipe.length === 0) return;

  const rawQuery = ui.searchInput.value.trim();
  const query = normalizeText(rawQuery).replace(/[.\-]/g, '');
  const selectedSector = ui.sectorFilter.value;

  const filtered = currentData.equipe.map((p, originalIdx) => ({ ...p, originalIdx })).filter(p => {
    let matchText = true;
    if (query) {
      const n = normalizeText(p.nome || '').replace(/[.\-]/g, '');
      const c = String(p.cpf || '').replace(/[.\-]/g, '');
      // Verificamos se a query (sem pontos/traços) está contida no nome ou CPF (ambos sem pontos/traços)
      matchText = n.includes(query) || c.includes(query);
    }
    let matchSector = true;
    if (selectedSector) matchSector = (p.setor === selectedSector);
    return matchText && matchSector;
  });

  ui.searchCount.textContent = `${filtered.length} de ${currentData.equipe.length} registros`;
  
  // Atualiza o texto do botão de gravação para mostrar o que será enviado
  if (filtered.length === currentData.equipe.length) {
    ui.syncSheetsBtn.textContent = `☁️ Gravar Tudo (${filtered.length} registros)`;
  } else {
    ui.syncSheetsBtn.textContent = `🔍 Gravar Selecionados (${filtered.length})`;
  }

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
    let statusClass = 'badge-success';
    if (person.status.includes('OCR')) statusClass = 'badge-warning';
    if (person.status === 'ATENDIDO') statusClass = 'badge-danger';

    const confirmBtn = person.status !== 'ATENDIDO' 
      ? `<button class="btn-confirm-row" data-idx="${person.originalIdx}">Confirmar</button>` 
      : '';

    return `<tr>
        <td>${idx + 1}</td>
        <td><strong>${nome}</strong><br><small style="color:#64748b;">${person.arquivo}</small></td>
        <td>${cpf}</td>
        <td><span class="badge" style="background: rgba(99,102,241,0.15); color: #818cf8;">${person.setor}</span></td>
        <td style="font-size: 0.8rem; color: #94a3b8;">${person.servico || 'GERAL'}</td>
        <td>${person.horario || '<span style="color:#64748b;">--:--</span>'}</td>
        <td><span class="badge ${statusClass}">${person.status}</span></td>
        <td>
            ${confirmBtn}
            <button class="btn-edit-row" data-idx="${person.originalIdx}">Editar</button>
        </td>
    </tr>`;
  }).join('');

  // Attach edit events once
  document.querySelectorAll('.btn-edit-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      openEditModal(parseInt(e.target.dataset.idx));
    });
  });

  // Attach confirm events
  document.querySelectorAll('.btn-confirm-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      confirmAttendance(idx);
    });
  });
}

function confirmAttendance(index) {
  const currentData = state.getState();
  currentData.equipe[index].status = 'ATENDIDO';
  state.setState(currentData);
  renderTable();
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
  if (!currentData || currentData.equipe.length === 0) return;

  if (!sheets.scriptUrl) {
    const url = prompt('Cole aqui a URL do seu Web App do Google Apps Script:');
    if (!url) return;
    sheets.setScriptUrl(url);
  }

  // Filtragem idêntica à do renderTable para garantir que gravamos o que o usuário vê
  const rawQuery = ui.searchInput.value.trim();
  const query = normalizeText(rawQuery).replace(/[.\-]/g, '');
  const selectedSector = ui.sectorFilter.value;

  const filteredRecords = currentData.equipe.filter(p => {
    let matchText = true;
    if (query) {
      const n = normalizeText(p.nome || '').replace(/[.\-]/g, '');
      const c = String(p.cpf || '').replace(/[.\-]/g, '');
      matchText = n.includes(query) || c.includes(query);
    }
    let matchSector = true;
    if (selectedSector) matchSector = (p.setor === selectedSector);
    return matchText && matchSector;
  });

  if (filteredRecords.length === 0) {
    alert('Nenhum registro selecionado pelos filtros atuais.');
    return;
  }

  // Prompt opcional para nome de setor único em "Gravar Tudo"
  let batchSectorOverride = null;
  if (filteredRecords.length === currentData.equipe.length) {
    batchSectorOverride = prompt("Deseja definir um nome de Setor/Unidade único para todos os registros? (Deixe em BRANCO para usar os nomes dos arquivos originais)");
    if (batchSectorOverride) batchSectorOverride = batchSectorOverride.trim().toUpperCase();
  }

  const metadata = {
    name: 'Extração PDFNice',
    reason: 'Sincronização Dashboard',
    sector: batchSectorOverride || selectedSector || 'Geral', 
    date: Array.from(currentData.datas)[0] || new Date().toLocaleDateString('pt-BR')
  };

  ui.syncSheetsBtn.disabled = true;
  const originalText = ui.syncSheetsBtn.textContent;
  ui.syncSheetsBtn.textContent = '🔄 Gravando...';

  try {
    const recordsToSync = filteredRecords.map(p => ({
      ...p,
      planilha: p.arquivo || 'N/A',
      setor: batchSectorOverride || p.setor || 'Geral',
      motivo: metadata.reason 
    }));

    await sheets.saveExtraction(metadata, recordsToSync);
    alert(`Sincronização de ${recordsToSync.length} registros concluída com sucesso!`);
  } catch (error) {
    alert('Erro ao sincronizar: ' + error.message);
  } finally {
    ui.syncSheetsBtn.disabled = false;
    ui.syncSheetsBtn.textContent = originalText;
  }
}

/**
 * Normaliza horários que o Google Sheets envia como data ISO de 1899
 * devido ao fuso horário histórico (GMT-03:06:28).
 */
function formatTimeFromISO(val) {
  if (typeof val !== 'string') return val;
  if (val.startsWith('1899-12-30T')) {
    const d = new Date(val);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return val;
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
          nome: String(nome || '').trim(),
          cpf: String(cpf || '').trim(),
          setor: String(sector || 'GERAL'),
          servico: String(servico || 'GERAL'),
          horario: formatTimeFromISO(horario),
          status: String(status || 'Pendente'),
          arquivo: String(sheet || 'Histórico')
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
// ─── Highlight Search Match ───────────────────────────────────
function highlightMatch(text, query) {
  if (!query || !text) return text || '';
  
  const strText = String(text);
  const normalizedText = normalizeText(strText).replace(/[.\-]/g, '');
  const cleanQuery = query.replace(/[.\-]/g, '');
  
  const idx = normalizedText.indexOf(cleanQuery);
  if (idx === -1) return strText;

  // Mapeamento de índices do texto limpo de volta para o texto original
  let origStart = -1, cleanCount = 0;
  for (let i = 0; i < strText.length; i++) {
    if (cleanCount === idx) { origStart = i; break; }
    // Apenas incrementamos se não for um caractere que removemos na limpeza
    if (!/[.\-]/.test(strText[i])) cleanCount++;
  }
  
  if (origStart === -1) return strText;

  let origEnd = origStart, matchCleanCount = 0;
  for (let i = origStart; i < strText.length && matchCleanCount < cleanQuery.length; i++) {
    origEnd = i + 1;
    if (!/[.\-]/.test(strText[i])) matchCleanCount++;
  }

  return strText.substring(0, origStart) + '<mark>' + strText.substring(origStart, origEnd) + '</mark>' + strText.substring(origEnd);
}

// ─── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  const currentData = state.getState();
  if (!currentData || currentData.equipe.length === 0) return;
  
  const rawQuery = ui.searchInput.value.trim();
  const query = normalizeText(rawQuery).replace(/[.\-]/g, '');
  const selectedSector = ui.sectorFilter.value;

  const filtered = currentData.equipe.filter(p => {
    let matchText = true;
    if (query) {
      const n = normalizeText(p.nome || '').replace(/[.\-]/g, '');
      const c = String(p.cpf || '').replace(/[.\-]/g, '');
      matchText = n.includes(query) || c.includes(query);
    }
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
  const cleanName = name.replace(/\.pdf$/i, '').replace(/\.xlsx?$/i, '');
  const clean = name.toUpperCase();
  if (clean.includes('SEDES')) return 'SEDES';
  if (clean.includes('SEAPE')) return 'SEAPE';
  if (clean.includes('PCDF')) return 'PCDF';
  if (clean.includes('DETRAN')) return 'DETRAN';
  if (clean.includes('INSS')) return 'INSS';
  return cleanName;
}
// ─── Add skip to dashboard button event (if we had it in HTML)
document.addEventListener('click', (e) => {
    if (e.target.id === 'viewDashboardBtn') {
        showDashboard();
    }
});
