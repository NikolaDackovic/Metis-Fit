import {
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  MinusCircle,
  PauseCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { Children, isValidElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SubNav } from '@/components/SubNav';
import { spacing } from '@/lib/rtl';
import { color, fonts, MAX_CONTENT_WIDTH, radius, type } from '@/theme';

/** Screen shell: safe area, dark background, centered max width (tablets/web), pull-to-refresh. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  edges = ['top'],
  transparent,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  edges?: Array<'top' | 'bottom'>;
  transparent?: boolean;
}) {
  // A back arrow/header as the first child stays fixed at the top (with the bottom bar below):
  // it is a screen opened from a tab, so moving around must stay one tap away while scrolling.
  const items = Children.toArray(children);
  const first = items[0];
  const sticky =
    isValidElement(first) && Boolean((first.type as { stickyTop?: boolean }).stickyTop);
  const inner = <View style={styles.content}>{sticky ? items.slice(1) : children}</View>;
  return (
    <SafeAreaView
      style={[styles.screen, transparent && { backgroundColor: 'transparent' }]}
      edges={sticky ? edges.filter((e) => e !== 'bottom') : edges}
    >
      {sticky && <View style={styles.top}>{first}</View>}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={Boolean(refreshing)}
                onRefresh={onRefresh}
                tintColor={color.accent[500]}
              />
            ) : undefined
          }
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
      {sticky && <SubNav />}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon: Icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
}) {
  const fg =
    variant === 'primary' ? color.onAccent : variant === 'danger' ? '#FFFFFF' : color.text.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && {
          backgroundColor: pressed ? color.accent[600] : color.accent[500],
        },
        variant === 'secondary' && [
          styles.buttonSecondary,
          pressed && { backgroundColor: color.bg.elevated },
        ],
        variant === 'ghost' && { backgroundColor: pressed ? color.bg.surface2 : 'transparent' },
        variant === 'danger' && {
          backgroundColor: color.status.danger,
          opacity: pressed ? 0.85 : 1,
        },
        (disabled || loading) && { opacity: 0.5 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : Icon ? <Icon size={18} color={fg} /> : null}
      <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={[type.label, styles.sectionTitle]}>{children}</Text>;
}

export function Field({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string | null }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.text.muted}
        style={[styles.input, error ? { borderColor: color.status.danger } : null]}
        accessibilityLabel={label}
        {...input}
      />
      {error ? <Text style={styles.error}>{t(error)}</Text> : null}
    </View>
  );
}

export type StatusKey =
  'active' | 'expiring_soon' | 'expired' | 'paused' | 'pending' | 'cancelled' | 'none';
const STATUS: Record<StatusKey, { c: string; Icon: LucideIcon }> = {
  active: { c: color.status.success, Icon: CheckCircle2 },
  expiring_soon: { c: color.status.warning, Icon: Clock },
  expired: { c: color.status.danger, Icon: XCircle },
  paused: { c: color.status.neutral, Icon: PauseCircle },
  pending: { c: color.status.info, Icon: Circle },
  cancelled: { c: color.status.neutral, Icon: Ban },
  none: { c: color.status.neutral, Icon: MinusCircle },
};

/** Status = color + icon + text (never color alone). */
export function StatusBadge({ status }: { status: StatusKey }) {
  const { t } = useTranslation();
  const { c, Icon } = STATUS[status];
  return (
    <View style={[styles.badge, { borderColor: `${c}66`, backgroundColor: `${c}1A` }]}>
      <Icon size={12} color={c} />
      <Text style={[styles.badgeText, { color: c }]}>
        {t(status === 'none' ? 'app.membership.none_short' : `membership.status.${status}`)}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Icon size={28} color={color.text.muted} />
      <Text style={[type.h3, { textAlign: 'center' }]}>{title}</Text>
      {text ? <Text style={[type.bodySm, { textAlign: 'center' }]}>{text}</Text> : null}
      {action}
    </View>
  );
}

export function Skeleton({ height, style }: { height: number; style?: ViewStyle }) {
  return (
    <View
      accessibilityElementsHidden
      style={[{ height, borderRadius: radius.md, backgroundColor: color.bg.surface2 }, style]}
    />
  );
}

export function ErrorNote({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {t(message, { defaultValue: t('errors.internal') })}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.base },
  scroll: { flexGrow: 1, paddingBottom: 32 },
  top: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    gap: 16,
    flexGrow: 1,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.sm,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonSecondary: {
    backgroundColor: color.bg.surface2,
    borderWidth: 1,
    borderColor: color.border.strong,
  },
  buttonLabel: { fontFamily: fonts.bold, fontSize: 16 },
  card: {
    backgroundColor: color.bg.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    padding: 16,
  },
  sectionTitle: { marginTop: 8 },
  input: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.surface2,
    paddingHorizontal: 14,
    color: color.text.primary,
    fontFamily: fonts.medium,
    fontSize: 16,
  },
  error: { color: color.status.danger, fontFamily: fonts.medium, fontSize: 13 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: spacing(0.6),
    textTransform: 'uppercase',
  },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 16 },
});
