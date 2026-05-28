import { createContext, useContext } from 'react';

/** Khi nhúng chat trong tab Cloud: truyền id/name/type thay vì chỉ dùng URL. */
export type ChatRouteParamsOverride = {
  id: string;
  name?: string;
  type?: string;
  jumpMessageId?: string;
} | null;

export const ChatRouteParamsOverrideContext =
  createContext<ChatRouteParamsOverride>(null);

export function useChatRouteParamsOverride(): ChatRouteParamsOverride {
  return useContext(ChatRouteParamsOverrideContext);
}

/** Tuỳ chọn hiển thị header (tab Cloud + màn tài liệu lồng stack). */
export type ChatPresentationExtras = {
  /** Nút mở màn “Tài liệu của tôi” (cloud tab). */
  cloudTabDocumentsNav?: { onOpenDocuments: () => void };
  /** Ẩn nút back (màn gốc trong tab Cloud). */
  hideHeaderBack?: boolean;
};

export const ChatPresentationExtrasContext = createContext<ChatPresentationExtras>({});

export function useChatPresentationExtras(): ChatPresentationExtras {
  return useContext(ChatPresentationExtrasContext);
}
