import { LOCALES } from '@baliqbozor/i18n';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <View style={styles.row} accessibilityLabel={t('common.language')}>
      {LOCALES.map((locale) => {
        const selected = i18n.language === locale;
        return (
          <Pressable
            key={locale}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => void i18n.changeLanguage(locale)}
            style={[styles.item, selected && styles.itemSelected]}
          >
            <Text style={[styles.text, selected && styles.textSelected]}>
              {t(`common.languages.${locale}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  item: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  itemSelected: { backgroundColor: colors.brand700 },
  text: { fontSize: 16, fontWeight: '500', color: colors.brand700 },
  textSelected: { color: colors.white },
});
