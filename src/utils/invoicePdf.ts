import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { PaymentRecord } from '../types';

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function formatDateId(iso?: string): string {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return (
    dt.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB'
  );
}

function formatCategory(category: PaymentRecord['category']): string {
  if (category === 'SCRIM_SPLIT_BILL') return 'SPLIT-BILL SCRIM';
  if (category === 'CASTER_PAYOUT') return 'PAYOUT SHOUTCASTER';
  return 'REFUND DANA SCRIM';
}

function formatMethod(method?: PaymentRecord['paymentMethod']): string {
  if (!method) return 'Belum Dipilih';
  const labels: Record<string, string> = {
    QRIS: 'QRIS Dinamis (ORDAL Escrow)',
    VA_BCA: 'BCA Virtual Account',
    VA_MANDIRI: 'Mandiri Virtual Account',
    VA_BNI: 'BNI Virtual Account',
    VA_BRI: 'BRI Virtual Account (BRIVA)',
    TRANSFER_BCA: 'Transfer Bank BCA',
    TRANSFER_MANDIRI: 'Transfer Bank Mandiri',
    TRANSFER_BNI: 'Transfer Bank BNI',
    TRANSFER_BRI: 'Transfer Bank BRI',
    GOPAY: 'E-Wallet GoPay',
    OVO: 'E-Wallet OVO',
    DANA: 'E-Wallet DANA',
    SHOPEEPAY: 'E-Wallet ShopeePay',
    INTERNAL_ADMIN: 'Verifikasi Internal Admin',
  };
  return labels[method] || method;
}

function getStatusInfo(status: PaymentRecord['status']): {
  label: string;
  rgb: [number, number, number];
  bgRgb: [number, number, number];
} {
  if (status === 'VERIFIED') {
    return { label: 'TERVALIDASI LUNAS', rgb: [0, 145, 178], bgRgb: [224, 247, 250] };
  }
  if (status === 'PENDING_VALIDATION') {
    return { label: 'MENUNGGU VALIDASI', rgb: [180, 110, 0], bgRgb: [254, 243, 199] };
  }
  if (status === 'REJECTED') {
    return { label: 'DITOLAK / REVISI', rgb: [200, 30, 65], bgRgb: [255, 228, 230] };
  }
  if (status === 'EXPIRED') {
    return { label: 'KEDALUWARSA', rgb: [100, 116, 139], bgRgb: [226, 232, 240] };
  }
  return { label: 'BELUM DIBAYAR', rgb: [82, 108, 0], bgRgb: [244, 252, 204] };
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' | null {
  if (/^data:image\/png;base64,/i.test(dataUrl)) return 'PNG';
  if (/^data:image\/jpe?g;base64,/i.test(dataUrl)) return 'JPEG';
  if (/^data:image\/webp;base64,/i.test(dataUrl)) return 'WEBP';
  return null;
}

export function generateInvoicePdf(
  payment: PaymentRecord,
  options?: { hideEscrowChannels?: boolean }
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  let y = 0;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - 20) {
      doc.addPage();
      y = 18;
    }
  };

  // 1. Header Banner (ORDAL Dark Brand)
  doc.setFillColor(10, 12, 16);
  doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFillColor(0, 240, 255);
  doc.rect(0, 38, pageWidth, 1.5, 'F');

  doc.setTextColor(0, 240, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ORDAL ESPORTS HUB · OFFICIAL BILLING & ESCROW', marginX, 13);

  doc.setTextColor(248, 250, 252);
  doc.setFontSize(20);
  doc.text('INVOICE PEMBAYARAN', marginX, 24);

  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${formatCategory(payment.category)}${payment.game ? ` · ${payment.game}` : ''}`, marginX, 31);

  // Right side of Header: Invoice Number & Status Badge
  const statusInfo = getStatusInfo(payment.status);
  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(payment.invoiceNumber, pageWidth - marginX, 15, { align: 'right' });

  const badgeW = 46;
  const badgeH = 7.5;
  const badgeX = pageWidth - marginX - badgeW;
  const badgeY = 19.5;
  doc.setFillColor(...statusInfo.bgRgb);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'F');
  doc.setTextColor(...statusInfo.rgb);
  doc.setFontSize(8);
  doc.text(statusInfo.label, badgeX + badgeW / 2, badgeY + 5, { align: 'center' });

  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Terbit: ${formatDateId(payment.issuedAt)}`, pageWidth - marginX, 33, { align: 'right' });

  y = 48;

  // 2. Transaction Title Strip
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(marginX, y, contentWidth, 14, 1.5, 1.5, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const titleLines = doc.splitTextToSize(payment.title, contentWidth - 8);
  doc.text(titleLines[0] || payment.title, marginX + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const dueOrValidated = payment.validatedAt
    ? `Divalidasi: ${formatDateId(payment.validatedAt)}${payment.validatedBy ? ` oleh ${payment.validatedBy}` : ''}`
    : payment.dueAt
      ? `Batas Pembayaran: ${formatDateId(payment.dueAt)}`
      : `ID Referensi Sistem: ${payment.id}`;
  doc.text(dueOrValidated, marginX + 4, y + 11);

  y += 20;

  // 3. Billing Parties (Two Columns)
  const colW = (contentWidth - 6) / 2;
  const partyBoxH = 26;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(marginX, y, colW, partyBoxH, 1.5, 1.5, 'FD');
  doc.roundedRect(marginX + colW + 6, y, colW, partyBoxH, 1.5, 1.5, 'FD');

  // Left: Payer
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PIHAK PEMBAYAR (DARI)', marginX + 4, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize(payment.payerName, colW - 8)[0] || '-', marginX + 4, y + 12.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(payment.payerEmail || 'Akun Terdaftar ORDAL Hub', marginX + 4, y + 18.5);

  // Right: Receiver
  const rightX = marginX + colW + 6;
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PIHAK PENERIMA (KEPADA)', rightX + 4, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize(payment.receiverName, colW - 8)[0] || '-', rightX + 4, y + 12.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const receiverSub = payment.bankOrWallet
    ? `${payment.bankOrWallet} ${payment.accountNumber || ''} (${payment.accountName || ''})`
    : 'ORDAL Official Escrow & Settlement';
  doc.text(doc.splitTextToSize(receiverSub, colW - 8)[0] || '-', rightX + 4, y + 18.5);

  y += partyBoxH + 8;

  // 4. Itemized Line Items Table
  doc.setFillColor(18, 22, 31);
  doc.rect(marginX, y, contentWidth, 9, 'F');
  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('NO', marginX + 4, y + 6);
  doc.text('DESKRIPSI ITEM TAGIHAN', marginX + 14, y + 6);
  doc.text('NOMINAL', pageWidth - marginX - 4, y + 6, { align: 'right' });
  y += 9;

  const items = payment.lineItems && payment.lineItems.length > 0
    ? payment.lineItems
    : [{ label: payment.title, amount: payment.amount }];

  items.forEach((item, idx) => {
    const labelLines = doc.splitTextToSize(item.label, contentWidth - 54);
    const rowH = Math.max(9, labelLines.length * 4.5 + 4.5);
    ensureSpace(rowH + 14);
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, contentWidth, rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(String(idx + 1), marginX + 4, y + 5.8);
    doc.setTextColor(15, 23, 42);
    doc.text(labelLines, marginX + 14, y + 5.8);
    doc.setFont('helvetica', 'bold');
    doc.text(formatRupiah(item.amount), pageWidth - marginX - 4, y + 5.8, { align: 'right' });
    y += rowH;
  });

  // Total Row
  ensureSpace(14);
  doc.setFillColor(10, 12, 16);
  doc.rect(marginX, y, contentWidth, 11, 'F');
  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL INVOICE', marginX + 4, y + 7.2);
  doc.setTextColor(204, 255, 0);
  doc.setFontSize(12);
  doc.text(formatRupiah(payment.amount), pageWidth - marginX - 4, y + 7.4, { align: 'right' });
  y += 17;

  // 5. Payment Method, Reference & Notes
  ensureSpace(36);
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  const metaNotes: string[] = [
    `Metode Pembayaran : ${formatMethod(payment.paymentMethod)}`,
    `Kode Referensi    : ${payment.referenceCode || '-'}`,
    ...(payment.gatewayOrderId
      ? [`Gateway / Order   : ${payment.gatewayProvider || 'SANDBOX'} · ${payment.gatewayOrderId}`]
      : []),
    ...(payment.vaNumber ? [`Nomor Virtual Acc : ${payment.vaNumber}`] : []),
    ...(payment.submittedAt ? [`Dikirim Pada      : ${formatDateId(payment.submittedAt)}`] : []),
    ...(payment.proofNote ? [`Catatan Pengirim  : ${payment.proofNote}`] : []),
    ...(payment.validationNote ? [`Catatan Validasi  : ${payment.validationNote}`] : []),
  ];
  const wrappedMetaLines = metaNotes.flatMap((line) => doc.splitTextToSize(line, contentWidth - 8));
  const metaBoxH = wrappedMetaLines.length * 4.8 + 11;
  doc.roundedRect(marginX, y, contentWidth, metaBoxH, 1.5, 1.5, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('DETAIL KONFIRMASI & REFERENSI PEMBAYARAN', marginX + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(wrappedMetaLines, marginX + 4, y + 11.5);
  y += metaBoxH + 6;

  // Dynamic QRIS / VA Gateway Card OR Fallback Escrow Channels if Unpaid
  if (
    payment.category === 'SCRIM_SPLIT_BILL' &&
    payment.status !== 'VERIFIED' &&
    payment.status !== 'EXPIRED' &&
    !options?.hideEscrowChannels
  ) {
    if (payment.qrPayload) {
      try {
        const qr = QRCode.create(payment.qrPayload, { errorCorrectionLevel: 'M' });
        const qrSizeMm = 34;
        ensureSpace(44);
        doc.setFillColor(236, 254, 255);
        doc.setDrawColor(6, 182, 212);
        doc.roundedRect(marginX, y, contentWidth, 40, 1.5, 1.5, 'FD');

        const moduleCount = qr.modules.size;
        const cellMm = qrSizeMm / moduleCount;
        const qrX = marginX + 4;
        const qrY = y + 3;
        doc.setFillColor(255, 255, 255);
        doc.rect(qrX - 1, qrY - 1, qrSizeMm + 2, qrSizeMm + 2, 'F');
        doc.setFillColor(10, 12, 16);
        for (let r = 0; r < moduleCount; r++) {
          for (let c = 0; c < moduleCount; c++) {
            if (qr.modules.get(r, c)) {
              doc.rect(qrX + c * cellMm, qrY + r * cellMm, cellMm + 0.05, cellMm + 0.05, 'F');
            }
          }
        }

        doc.setTextColor(14, 116, 144);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('QRIS DINAMIS (BI-SNAP EMVCo)', marginX + 44, y + 9);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        doc.text(`Nominal Terkunci : ${formatRupiah(payment.amount)}`, marginX + 44, y + 16);
        doc.text(`Order ID         : ${payment.gatewayOrderId || '-'}`, marginX + 44, y + 22);
        doc.text(
          `Batas Bayar      : ${formatDateId(payment.gatewayExpiresAt || payment.dueAt)}`,
          marginX + 44,
          y + 28
        );
        y += 45;
      } catch {
        // Fallback silently to standard escrow box if QR payload fails
      }
    } else if (payment.vaNumber) {
      ensureSpace(24);
      doc.setFillColor(236, 254, 255);
      doc.setDrawColor(6, 182, 212);
      doc.roundedRect(marginX, y, contentWidth, 20, 1.5, 1.5, 'FD');
      doc.setTextColor(14, 116, 144);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${formatMethod(payment.paymentMethod).toUpperCase()} · OTOMATIS`, marginX + 4, y + 6.5);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.text(`No. VA: ${payment.vaNumber}   |   Total: ${formatRupiah(payment.amount)}`, marginX + 4, y + 13.5);
      y += 25;
    } else {
      ensureSpace(22);
      doc.setFillColor(236, 254, 255);
      doc.setDrawColor(6, 182, 212);
      doc.roundedRect(marginX, y, contentWidth, 18, 1.5, 1.5, 'FD');
      doc.setTextColor(14, 116, 144);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('SALURAN PEMBAYARAN ESCROW ORDAL ESPORTS HUB', marginX + 4, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        'QRIS: ORDAL ESPORTS HUB | BCA: 8810-2026-88 | Mandiri: 131-0020-2688 | GoPay/OVO/DANA: 0812-8800-2026',
        marginX + 4,
        y + 12.5
      );
      y += 23;
    }
  }

  // 6. Optional Attached Proof Image (Base64 data URLs only)
  if (payment.proofImageUrl) {
    const imgFormat = detectImageFormat(payment.proofImageUrl);
    if (imgFormat) {
      try {
        ensureSpace(64);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('LAMPIRAN BUKTI TRANSFER:', marginX, y + 4);
        y += 6;
        doc.addImage(payment.proofImageUrl, imgFormat, marginX, y, 56, 52, undefined, 'FAST');
        y += 58;
      } catch {
        // Skip invalid/corrupt image gracefully without breaking PDF export
      }
    }
  }

  // 7. Payment History Audit Trail
  const history = payment.history || [];
  if (history.length > 0) {
    ensureSpace(20);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`RIWAYAT PEMBAYARAN (${history.length} LOG)`, marginX, y + 4);
    y += 7;

    for (const evt of history) {
      const noteText = `[${formatDateId(evt.timestamp)}] ${evt.action.replace(/_/g, ' ')} · ${evt.actorName} (${evt.actorRole})`;
      const noteDetail = doc.splitTextToSize(evt.note || '-', contentWidth - 6);
      const blockH = 5 + noteDetail.length * 4.2 + 3;
      ensureSpace(blockH);

      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, y, marginX + contentWidth, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(15, 23, 42);
      doc.text(noteText, marginX + 2, y + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(noteDetail, marginX + 2, y + 9);
      y += blockH;
    }
  }

  // 8. Page Footers
  const totalPages = doc.getNumberOfPages();
  const generatedLabel = `Dicetak pada ${formatDateId(new Date().toISOString())}`;
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`ORDAL Esports Hub · ${payment.invoiceNumber} · ${generatedLabel}`, marginX, pageHeight - 8);
    doc.text(`Halaman ${page} / ${totalPages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    });
  }

  doc.save(`${payment.invoiceNumber}.pdf`);
}
