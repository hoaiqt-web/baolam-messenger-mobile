import { stripPycvtMeta } from '@/features/chat/pycvtParsers';
import { isStructuredChatMessage } from '@/components/chat/StructuredChatMessage';
import { getTaskVerificationPreview } from '@/features/chat/taskVerificationParsers';
import { getBugOutstandingDigestPreview } from '@/features/chat/bugOutstandingDigestParsers';
import { getPendingReceiptDigestPreview } from '@/features/chat/pendingReceiptDigestParsers';

const PO_META_START = '[[PO_UI_META]]';
const PO_META_END = '[[/PO_UI_META]]';

function stripPoMeta(body: string): string {
  const start = body.indexOf(PO_META_START);
  if (start < 0) return body;
  const end = body.indexOf(PO_META_END, start);
  if (end < 0) return body.slice(0, start).trimEnd();
  return (body.slice(0, start) + body.slice(end + PO_META_END.length)).trimEnd();
}

/** Short preview for list / pin bar — hides JSON meta blocks. */
export function getChatMessagePreview(body: string | null | undefined, maxLen = 140): string {
  const raw = String(body ?? '').trim();
  if (!raw) return '';

  const digestPreview = getBugOutstandingDigestPreview(raw);
  if (digestPreview) return digestPreview;

  const pendingReceiptPreview = getPendingReceiptDigestPreview(raw);
  if (pendingReceiptPreview) return pendingReceiptPreview;

  const verificationPreview = getTaskVerificationPreview(raw);
  if (verificationPreview) return verificationPreview;

  if (isStructuredChatMessage(raw)) {
    if (raw.includes('PHIẾU YÊU CẦU VẬT TƯ')) return '📋 Phiếu yêu cầu vật tư';
    if (raw.includes('PO #') && /ĐÃ (ĐƯỢC DUYỆT|BỊ TỪ CHỐI)/i.test(raw)) {
      return raw.includes('ĐIỀU XE') ? '✅ Điều xe đã duyệt' : '✅ PO đã duyệt';
    }
    if (raw.includes('Phê duyệt Chi Phí Vận Chuyển')) return '🚚 Phê duyệt vận chuyển';
    if (raw.includes('BÁO CÁO QLPX')) return '🏭 Báo cáo QLPX';
    if (raw.includes('BÁO CÁO QAQC') || raw.includes('BÁO CÁO KẾ HOẠCH NGÀY')) return '🛡️ Báo cáo QAQC';
    if (raw.includes('BÁO CÁO BCH')) return '🏗️ Báo cáo BCH';
    if (
      raw.includes('BÁO CÁO PHÒNG THIẾT KẾ')
      || raw.includes('CÔNG VIỆC PTK')
    ) return '🎨 Báo cáo Phòng Thiết kế';
    if (raw.startsWith('📋') && raw.includes('Giao lúc:')) return '📋 Phân công công việc';
    if (raw.includes('BÁO CÁO HOÀN THÀNH') || raw.includes('BÁO CÁO TẠM DỪNG')) return '✅ Báo cáo hoàn thành';
  }

  let text = stripPoMeta(stripPycvtMeta(raw)).replace(/\s+/g, ' ').trim();
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen)}…`;
  }
  return text;
}
