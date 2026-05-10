/**
 * TaskEvidenceUploadButton.tsx
 * Nút upload ảnh bằng chứng cho TaskDetailScreen.
 * Hiển thị progress, disabled khi đang upload, error inline.
 */
import React from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
} from "react-native";
import type { UploadState } from "@/hooks/useTaskAttachmentUpload";

type Props = {
  uploadState: UploadState;
  onPress: () => void;
  disabled?: boolean;
};

export function TaskEvidenceUploadButton({ uploadState, onPress, disabled }: Props) {
  const isActive =
    uploadState.status === "picking"   ||
    uploadState.status === "uploading" ||
    uploadState.status === "registering";

  const label = (() => {
    switch (uploadState.status) {
      case "picking":     return "Đang chọn ảnh...";
      case "uploading":
        return uploadState.progress < 50
          ? "Đang chuẩn bị..."
          : uploadState.progress < 90
          ? "Đang tải lên..."
          : "Đang hoàn tất...";
      case "registering": return "Đang lưu...";
      case "done":        return "✅ Đã đính kèm";
      case "error":       return "⚠️ Thử lại";
      default:            return "📎 Thêm ảnh bằng chứng";
    }
  })();

  const btnStyle = [
    styles.btn,
    isActive                           && styles.btnDisabled,
    uploadState.status === "done"      && styles.btnDone,
    uploadState.status === "error"     && styles.btnError,
    disabled                           && styles.btnDisabled,
  ];

  return (
    <View>
      <TouchableOpacity
        style={btnStyle}
        onPress={onPress}
        disabled={isActive || disabled}
        activeOpacity={0.75}
      >
        {isActive ? (
          <ActivityIndicator color="#fff" size="small" style={{ marginRight: 6 }} />
        ) : null}
        <Text style={styles.btnText}>{label}</Text>
      </TouchableOpacity>

      {/* Progress bar */}
      {uploadState.status === "uploading" && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${uploadState.progress}%` }]} />
        </View>
      )}

      {/* Error message */}
      {uploadState.status === "error" && (
        <Text style={styles.errorText}>{uploadState.message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    backgroundColor: "#6366F1",
    borderRadius:    10,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  btnDisabled: { backgroundColor: "#A5B4FC" },
  btnDone:     { backgroundColor: "#16A34A" },
  btnError:    { backgroundColor: "#DC2626" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  progressBar: {
    height: 3,
    backgroundColor: "#E0E7FF",
    borderRadius: 2,
    marginTop: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#6366F1",
    borderRadius: 2,
  },
  errorText: {
    fontSize: 11,
    color: "#DC2626",
    marginTop: 4,
    textAlign: "center",
  },
});
