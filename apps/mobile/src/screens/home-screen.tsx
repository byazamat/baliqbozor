import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HealthStatus } from '../components/health-status';
import { LanguageSwitcher } from '../components/language-switcher';
import { colors } from '../theme';

export function HomeScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <LanguageSwitcher />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {t('mobile.home.title')}
        </Text>
        <Text style={styles.subtitle}>{t('common.tagline')}</Text>
        <View style={styles.card}>
          <HealthStatus />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: { padding: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink },
  subtitle: { marginTop: 8, fontSize: 17, color: colors.inkMuted },
  card: { marginTop: 24 },
});
