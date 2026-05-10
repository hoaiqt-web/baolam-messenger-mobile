/**
 * useTaskAttachmentUpload.ts
 * Hook upload ảnh/file bằng chứng cho task.
 * Flow: pick image → presign → PUT GCS → register attachment → refresh task
 */
import { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";
import { chatApi } from "@/services/api/chatApi";
import { taskApi, extractTaskApiError } from "@/services/api/taskApi";
import type { TaskDetail } from "@/Models/task/types";
import type { PresignAttachmentFile } from "@/Models/chat/types";

// Presign không cần conversationId cho task — dùng 0 as placeholder
// Backend chỉ cần file metadata để generate signed URL
const TASK_PRESIGN_CONVERSATION_ID = 0;

export type UploadState =
  | { status: "idle" }
  | { status: "picking" }
  | { status: "uploading"; progress: number }  // 0–100
  | { status: "registering" }
  | { status: "done" }
  | { status: "error"; message: string };

type UseTaskAttachmentUploadReturn = {
  uploadState: UploadState;
  pickAndUpload: () => Promise<void>;
  canUpload: boolean;
};

export function useTaskAttachmentUpload(
  task: TaskDetail | null,
  onSuccess: (updatedTask: TaskDetail) => void
): UseTaskAttachmentUploadReturn {
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });

  const canUpload =
    uploadState.status === "idle" || uploadState.status === "done" || uploadState.status === "error";

  const pickAndUpload = useCallback(async () => {
    if (!task) return;

    // ── 1. Request permission ─────────────────────────────────────────────────
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Cần quyền", "Cho phép truy cập thư viện ảnh để đính kèm bằng chứng.");
        return;
      }
    }

    // ── 2. Launch picker ──────────────────────────────────────────────────────
    setUploadState({ status: "picking" });

    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 0.85,
        allowsMultipleSelection: false,
      });
    } catch {
      setUploadState({ status: "idle" });
      return;
    }

    // User cancelled
    if (result.canceled || !result.assets?.length) {
      setUploadState({ status: "idle" });
      return;
    }

    const asset = result.assets[0];
    const uri      = asset.uri;
    const mimeType = asset.mimeType ?? "image/jpeg";
    const fileSize = asset.fileSize ?? 0;
    const fileName = asset.fileName ?? `evidence_${Date.now()}.jpg`;
    const clientFileId = `task_${task.id}_${Date.now()}`;

    // ── 3. Presign ─────────────────────────────────────────────────────────────
    setUploadState({ status: "uploading", progress: 0 });

    let objectKey: string;
    let uploadUrl: string;
    let uploadHeaders: Record<string, string>;

    try {
      const presignFile: PresignAttachmentFile = {
        clientFileId,
        name:     fileName,
        mimeType,
        size:     fileSize,
      };

      const { items } = await chatApi.presignAttachments({
        conversationId: TASK_PRESIGN_CONVERSATION_ID,
        files: [presignFile],
      });

      const item = items[0];
      if (!item) throw new Error("Không nhận được presigned URL.");

      objectKey     = item.objectKey;
      uploadUrl     = item.uploadUrl;
      uploadHeaders = item.headers ?? {};
    } catch (err) {
      const { message } = extractTaskApiError(err);
      setUploadState({ status: "error", message: `Không thể lấy upload URL: ${message}` });
      return;
    }

    // ── 4. PUT to GCS ──────────────────────────────────────────────────────────
    setUploadState({ status: "uploading", progress: 30 });

    try {
      // React Native fetch supports PUT with body
      const fileBlob = await uriToBlob(uri);

      const uploadResp = await fetch(uploadUrl, {
        method:  "PUT",
        headers: {
          "Content-Type": mimeType,
          ...uploadHeaders,
        },
        body: fileBlob,
      });

      if (!uploadResp.ok) {
        throw new Error(`GCS upload failed: HTTP ${uploadResp.status}`);
      }
    } catch (err: any) {
      setUploadState({
        status:  "error",
        message: `Upload lên storage thất bại: ${err?.message ?? "Lỗi mạng"}`,
      });
      return;
    }

    // ── 5. Register attachment ────────────────────────────────────────────────
    setUploadState({ status: "registering" });

    try {
      await taskApi.registerAttachment(task.id, {
        gcs_key:       objectKey,
        original_name: fileName,
        mime_type:     mimeType,
        size_bytes:    fileSize,
      });
    } catch (err) {
      const { type, message } = extractTaskApiError(err);
      if (type === "duplicate_attachment") {
        // Duplicate — vẫn coi là thành công, refresh task
        Alert.alert("File đã tồn tại", "File này đã được đính kèm trước đó.");
      } else {
        setUploadState({ status: "error", message });
        return;
      }
    }

    // ── 6. Refresh task detail ─────────────────────────────────────────────────
    setUploadState({ status: "uploading", progress: 90 });

    try {
      const updatedTask = await taskApi.getTaskDetail(task.id);
      onSuccess(updatedTask);
    } catch {
      // Không block — attachment đã register OK
    }

    setUploadState({ status: "done" });

    // Auto-reset sau 2s để có thể upload tiếp
    setTimeout(() => setUploadState({ status: "idle" }), 2000);
  }, [task, onSuccess]);

  return { uploadState, pickAndUpload, canUpload };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert file URI → Blob (React Native safe) */
async function uriToBlob(uri: string): Promise<Blob> {
  const resp = await fetch(uri);
  return resp.blob();
}
