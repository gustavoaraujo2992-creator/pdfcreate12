/**
 * GOOGLE APPS SCRIPT - PDFNice Integration
 * 
 * INSTRUCTIONS:
 * 1. Open Google Sheets.
 * 2. Extensions > Apps Script.
 * 3. Delete any existing code and paste this.
 * 4. Click 'Deploy' > 'New Deployment'.
 * 5. Select 'Web App'.
 * 6. Execute as 'Me', Who has access 'Anyone'.
 * 7. Copy the Web App URL and paste it into PDFNice when prompted or in the console.
 */

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Historico_Extrações");
  if (!sheet) {
    sheet = ss.insertSheet("Historico_Extrações");
    sheet.appendRow(["Timestamp", "Planilha", "Motivo", "Setor", "Data Ref", "Nome", "CPF", "Horário", "Serviço", "Status"]);
  }
  
  const payload = JSON.parse(e.postData.contents);
  const metadata = payload.metadata;
  const records = payload.data;
  
  if (payload.action === 'save') {
    records.forEach(r => {
      // Prioridade TOTAL para o dado original de cada registro (linha)
      // Ordem das colunas: [Timestamp, Planilha, Motivo, Setor, Data Ref, Nome, CPF, Horário, Serviço, Status]
      const planillaFinal = r.planilha || r.arquivo || metadata.name || "N/A";
      const motivoFinal = r.motivo || metadata.reason || "N/A";
      const setorFinal = metadata.name || r.setor || metadata.sector || "N/A";

      sheet.appendRow([
        metadata.timestamp,
        planillaFinal,
        motivoFinal,
        setorFinal,
        metadata.date,
        r.nome,
        r.cpf,
        r.horario,
        r.servico,
        r.status
      ]);
    });
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Historico_Extrações");
  
  if (action === 'getLatest' && sheet) {
    const data = sheet.getDataRange().getValues();
    // Logic to return latest entries if needed
    return ContentService.createTextOutput(JSON.stringify({ data: data.slice(1) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput("PDFNice API Active")
    .setMimeType(ContentService.MimeType.TEXT);
}
