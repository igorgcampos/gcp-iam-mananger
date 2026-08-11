// Formato compartilhado por todo botão "copiar relatório" do app: monta uma
// tabela em texto (TSV — cola bem em planilhas) e em HTML (cola formatada em
// email/documentos) a partir das mesmas headers+rows, e escreve as duas no
// clipboard de uma vez. Navegadores sem suporte a ClipboardItem (ver MDN,
// Clipboard.write()) caem no fallback de texto puro.
export function buildClipboardTable(headers, rows) {
  const text = [headers, ...rows].map((row) => row.join('\t')).join('\n');

  const cellStyle = 'border:1px solid #ccc;padding:4px 8px;text-align:left';
  const headerRow = headers.map((h) => `<th style="${cellStyle};background:#fafafa">${h}</th>`).join('');
  const bodyRows = rows
    .map((row) => `<tr>${row.map((cell) => `<td style="${cellStyle}">${cell}</td>`).join('')}</tr>`)
    .join('');
  const html = `<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;

  return { html, text };
}

export async function copyTableToClipboard({ html, text }) {
  if (navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(text);
  }
}
