// ─── DOM Elements ─────────────────────────────────────────────
export const loginView = document.getElementById('loginView');
export const uploadView = document.getElementById('uploadView');
export const dashboardView = document.getElementById('dashboardView');
export const loginForm = document.getElementById('loginForm');
export const loginError = document.getElementById('loginError');

export const dropzone = document.getElementById('dropzone');
export const fileInput = document.getElementById('fileInput');
export const loadingSection = document.getElementById('loadingSection');
export const statusMessage = document.getElementById('statusMessage');
export const defaultSectorInput = document.getElementById('defaultSectorInput');

// Dashboard elements
export const searchInput = document.getElementById('searchInput');
export const sectorFilter = document.getElementById('sectorFilter');
export const searchCount = document.getElementById('searchCount');
export const tableBody = document.getElementById('tableBody');
export const noResults = document.getElementById('noResults');
export const toggleRawBtn = document.getElementById('toggleRawBtn');
export const rawOutput = document.getElementById('rawOutput');
export const addFileBtn = document.getElementById('addFileBtn');
export const exportCSVBtn = document.getElementById('exportCSVBtn');
export const newFileBtn = document.getElementById('newFileBtn');
export const syncSheetsBtn = document.getElementById('syncSheetsBtn');
export const loadSheetsBtn = document.createElement('button');
export const addPersonBtn = document.createElement('button');
export const logoutBtn = document.getElementById('logoutBtn');

// Metadata fields
export const sheetNameInput = document.getElementById('sheetNameInput');
export const sheetReasonInput = document.getElementById('sheetReasonInput');
export const sheetSectorInput = document.getElementById('sheetSectorInput');

// Edit Modal
export const editModal = document.getElementById('editModal');
export const editForm = document.getElementById('editForm');
export const cancelEdit = document.getElementById('cancelEdit');

// Stats
export const statTotal = document.getElementById('statTotal');
export const statSetor = document.getElementById('statSetor');
export const statData = document.getElementById('statData');
export const statPages = document.getElementById('statPages');

export function showLoginView() {
    loginView.style.display = 'flex';
    uploadView.style.display = 'none';
    dashboardView.style.display = 'none';
}

export function showUploadView() {
    loginView.style.display = 'none';
    uploadView.style.display = 'flex';
    dashboardView.style.display = 'none';
}

export function showDashboardView() {
    loginView.style.display = 'none';
    uploadView.style.display = 'none';
    dashboardView.style.display = 'block';
}
