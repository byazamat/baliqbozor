import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useApi } from '../api/context';
import { colors } from '../theme';

type State = 'checking' | 'ok' | 'down';

const BADGE: Record<State, { fg: string; bg: string }> = {
  checking: { fg: colors.neutralFg, bg: colors.neutralBg },
  ok: { fg: colors.successFg, bg: colors.successBg },
  down: { fg: colors.dangerFg, bg: colors.dangerBg },
};

/** Заглушка M0: состояние API через `api-client`. */
export function HealthStatus() {
  const { t } = useTranslation();
  const api = useApi();
  const query = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data, error } = await api.GET('/health');
      if (error !== undefined || !data) throw new Error('API unavailable');
      return data;
    },
    retry: false,
  });
  const state: State = query.isPending ? 'checking' : query.isSuccess ? 'ok' : 'down';

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {t('health.title')}
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>{t('health.api')}</Text>
        <Text
          testID="api-status"
          style={[styles.badge, { color: BADGE[state].fg, backgroundColor: BADGE[state].bg }]}
        >
          {t(`health.${state}`)}
        </Text>
      </View>
      {state === 'down' && (
        <Pressable
          accessibilityRole="button"
          style={styles.retry}
          onPress={() => void query.refetch()}
        >
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '600', color: colors.ink },
  row: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { fontSize: 16, color: colors.inkMuted },
  badge: {
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  retry: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 16, fontWeight: '500', color: colors.ink },
});
