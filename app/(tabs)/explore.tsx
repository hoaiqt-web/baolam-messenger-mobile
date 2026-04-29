import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpClient } from '@/services/api/httpClient';
import { authStorage } from '@/services/storage/authStorage';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    httpClient
      .get('/auth/me')
      .then(({ data }) => setUser(data.user || data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          try {
            await httpClient.post('/auth/logout');
          } catch {}
          authStorage.clearTokens();
          router.replace('/');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1E3A8A" />
        </View>
      </SafeAreaView>
    );
  }

  const userName = user?.fullName || user?.full_name || user?.username || 'Người dùng';
  const userUsername = user?.username || '';
  const userEmail = user?.email || '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚙️ Cài đặt</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {userName[0]?.toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.profileName}>{userName}</Text>
          <Text style={styles.profileUsername}>@{userUsername}</Text>
          {userEmail ? (
            <Text style={styles.profileEmail}>{userEmail}</Text>
          ) : null}
        </View>

        {/* Settings sections */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thông báo</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>🔔 Thông báo đẩy</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#D1D5DB', true: '#3B82F6' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tài khoản</Text>
          <TouchableOpacity style={styles.settingRow}>
            <Text style={styles.settingLabel}>👤 Thông tin cá nhân</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow}>
            <Text style={styles.settingLabel}>🔒 Đổi mật khẩu</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ứng dụng</Text>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>📱 Phiên bản</Text>
            <Text style={styles.settingValue}>2.0.0</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>🏢 Tổ chức</Text>
            <Text style={styles.settingValue}>BAOLAM</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Đăng xuất</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          BAOLAM Messenger v2.0.0{'\n'}© 2026 BAOLAM Corporation
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  scrollView: { flex: 1 },
  profileCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarLargeText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  profileUsername: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  profileEmail: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    textTransform: 'uppercase',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F3F4F6',
  },
  settingLabel: {
    fontSize: 15,
    color: '#111827',
  },
  settingValue: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  settingArrow: {
    fontSize: 22,
    color: '#D1D5DB',
    fontWeight: '300',
  },
  logoutBtn: {
    backgroundColor: '#EF4444',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  logoutBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footerText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 20,
    marginBottom: 40,
    lineHeight: 18,
  },
});
