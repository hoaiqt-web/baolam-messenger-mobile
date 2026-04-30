// Styles for the chat screen.
// Extracted from [id].tsx to keep the main component focused on logic.

import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  messageList: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },

  messageRow: { flexDirection: 'row', marginBottom: 4 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowOther: { justifyContent: 'flex-start' },

  avatarCol: { width: 36, marginRight: 6, justifyContent: 'flex-end' },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmallText: { fontSize: 14, fontWeight: 'bold', color: '#FFF' },
  avatarSpacer: { width: 32, height: 32 },

  bubbleCol: { maxWidth: '75%' },
  bubbleColMine: { alignItems: 'flex-end' },

  senderLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: 4,
  },

  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
  bubbleMine: { backgroundColor: '#1E3A8A', borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleOptimistic: { opacity: 0.55 },
  attachmentList: { gap: 8, marginBottom: 6 },
  attachmentImage: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  fileAttachmentCard: {
    minWidth: 170,
    maxWidth: 220,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  fileAttachmentName: { color: '#111827', fontSize: 13, fontWeight: '600' },
  fileAttachmentMeta: { color: '#6B7280', fontSize: 11, marginTop: 2 },

  bubbleText: { fontSize: 16, lineHeight: 22, color: '#1F2937' },
  bubbleTextMine: { color: '#FFFFFF' },

  timeText: { fontSize: 11, color: '#9CA3AF', marginTop: 2, marginLeft: 4 },
  timeTextMine: { marginRight: 4, marginLeft: 0, textAlign: 'right' },

  emptyChat: {
    alignItems: 'center',
    paddingTop: 60,
    transform: [{ scaleY: -1 }],
  },
  emptyChatIcon: { fontSize: 48, marginBottom: 12 },
  emptyChatText: { fontSize: 16, color: '#9CA3AF' },

  inputBar: {
    flexDirection: 'row',
    padding: 8,
    paddingHorizontal: 12,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'flex-end',
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  attachBtnDisabled: { opacity: 0.7 },
  inputField: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 16,
    maxHeight: 100,
    minHeight: 42,
    color: '#111827',
  },
  sendBtn: {
    marginLeft: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },
  sendBtnIcon: { color: '#FFFFFF', fontSize: 20, marginLeft: 2 },

  // Full-screen image preview
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewHeader: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  imagePreviewCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewCloseText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  imagePreviewFooter: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  imagePreviewHint: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },

  // Date separators
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    paddingHorizontal: 20,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D1D5DB',
  },
  dateSeparatorText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Reply quote in message bubble
  replyQuote: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    marginBottom: 4,
    overflow: 'hidden',
  },
  replyQuoteBar: {
    width: 3,
    backgroundColor: '#1E3A8A',
    borderRadius: 2,
  },
  replyQuoteContent: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  replyQuoteSender: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 1,
  },
  replyQuoteText: {
    fontSize: 12,
    color: '#6B7280',
  },

  // Reply preview bar above input
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  replyPreviewBar: {
    width: 3,
    height: '100%',
    backgroundColor: '#1E3A8A',
    borderRadius: 2,
    marginRight: 8,
    minHeight: 30,
  },
  replyPreviewContent: {
    flex: 1,
  },
  replyPreviewSender: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  replyPreviewText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  replyPreviewClose: {
    padding: 4,
    marginLeft: 8,
  },

  // Recalled message
  bubbleRecalled: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
  },
  recalledText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },

  // Emoji reactions
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 4,
  },
  reactionsRowMine: {
    justifyContent: 'flex-end',
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reactionBadgeActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 2,
  },

  // Message actions bottom sheet
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  menuReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  menuReactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuReactionBtnActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  menuReactionEmoji: {
    fontSize: 22,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  menuItemIcon: {
    fontSize: 18,
    width: 30,
    textAlign: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: '#111827',
    marginLeft: 8,
  },
  menuItemTextDanger: {
    color: '#EF4444',
  },
  forwardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    paddingVertical: 12,
  },

  // @Mention suggestions
  mentionSuggestions: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    maxHeight: 180,
    paddingHorizontal: 12,
  },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F3F4F6',
  },
  mentionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
  },
  mentionUsername: {
    fontSize: 12,
    color: '#6B7280',
  },
});
