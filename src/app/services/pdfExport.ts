// PDF Export utility using browser print
// This generates a formatted logbook report that can be saved as PDF

export function exportLogbookPDF(
  studentName: string,
  department: string,
  matricNumber: string,
  email: string,
  entries: any[],
  stats: { totalEntries: number; approved: number; pending: number; totalHours: number }
) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to export your logbook as PDF');
    return;
  }

  const approvedEntries = entries.filter(e => e.status === 'Approved');
  const sortedEntries = [...(approvedEntries.length > 0 ? approvedEntries : entries)]
    .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());

  const entriesHTML = sortedEntries.map((entry, i) => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${i + 1}</td>
      <td style="padding:8px;border:1px solid #ddd">${entry.entry_date}</td>
      <td style="padding:8px;border:1px solid #ddd"><strong>${entry.title}</strong><br/><span style="color:#555;font-size:12px">${entry.description}</span></td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${entry.hours_worked}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center;color:${entry.status === 'Approved' ? 'green' : entry.status === 'Rejected' ? 'red' : '#888'}">${entry.status}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">___________</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>SIWES Logbook - ${studentName}</title>
      <style>
        body { font-family: 'Times New Roman', serif; margin: 40px; color: #333; }
        h1 { text-align: center; font-size: 22px; margin-bottom: 5px; }
        h2 { text-align: center; font-size: 16px; color: #555; margin-top: 0; }
        .header-section { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .logo-text { font-size: 28px; font-weight: bold; color: #1e40af; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0; font-size: 14px; }
        .info-item { display: flex; gap: 8px; }
        .info-label { font-weight: bold; min-width: 140px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
        th { background: #1e40af; color: white; padding: 10px 8px; border: 1px solid #1e40af; text-align: left; }
        .summary { margin-top: 30px; padding: 15px; background: #f0f4ff; border-radius: 8px; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align: center; }
        .summary-item { padding: 10px; }
        .summary-value { font-size: 24px; font-weight: bold; color: #1e40af; }
        .summary-label { font-size: 12px; color: #666; }
        .footer { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .signature-block { border-top: 1px solid #333; padding-top: 10px; margin-top: 60px; text-align: center; font-size: 13px; }
        @media print { body { margin: 20px; } }
      </style>
    </head>
    <body>
      <div class="header-section">
        <div class="logo-text">e-SIWES</div>
        <h1>STUDENT INDUSTRIAL WORK EXPERIENCE SCHEME</h1>
        <h2>Digital Logbook Report</h2>
      </div>

      <div class="info-grid">
        <div class="info-item"><span class="info-label">Student Name:</span><span>${studentName}</span></div>
        <div class="info-item"><span class="info-label">Email:</span><span>${email}</span></div>
        <div class="info-item"><span class="info-label">Department:</span><span>${department || 'N/A'}</span></div>
        <div class="info-item"><span class="info-label">Matric Number:</span><span>${matricNumber || 'N/A'}</span></div>
        <div class="info-item"><span class="info-label">Date Generated:</span><span>${new Date().toLocaleDateString()}</span></div>
        <div class="info-item"><span class="info-label">Total Entries:</span><span>${entries.length}</span></div>
      </div>

      <div class="summary">
        <div class="summary-grid">
          <div class="summary-item"><div class="summary-value">${stats.totalEntries}</div><div class="summary-label">Total Entries</div></div>
          <div class="summary-item"><div class="summary-value">${stats.approved}</div><div class="summary-label">Approved</div></div>
          <div class="summary-item"><div class="summary-value">${stats.pending}</div><div class="summary-label">Pending</div></div>
          <div class="summary-item"><div class="summary-value">${stats.totalHours}</div><div class="summary-label">Hours Logged</div></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:40px">S/N</th>
            <th style="width:90px">Date</th>
            <th>Activity / Description</th>
            <th style="width:50px">Hours</th>
            <th style="width:70px">Status</th>
            <th style="width:100px">Supervisor</th>
          </tr>
        </thead>
        <tbody>${entriesHTML}</tbody>
      </table>

      <div class="footer">
        <div>
          <div class="signature-block">
            <p><strong>Student Signature</strong></p>
            <p>${studentName}</p>
          </div>
        </div>
        <div>
          <div class="signature-block">
            <p><strong>Supervisor Signature</strong></p>
            <p>_______________________</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
  };
}
