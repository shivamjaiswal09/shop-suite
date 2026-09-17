import { Ionicons } from '@expo/vector-icons';
import type { ScreenPermission } from '@shop/core';
import {
  useCan,
  useCompany,
  useCurrentRole,
  useLogout,
  useMustChangePassword,
  usePermissions,
  useSessionStore,
} from '@shop/state';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Row,
  ScrollScreen,
  SectionTitle,
  type IconName,
} from '@/components/ui';
import { ChangePasswordSheet } from '@/components/change-password-sheet';
import { fontSize, spacing, useTheme, useThemeMode } from '@/lib/theme';

/**
 * Desk work the phone deliberately does not try to replace — stated plainly,
 * and only the parts this user's role could actually reach on the web app.
 * Listing Administration to a cashier would just be advertising a locked door.
 */
const ON_WEB: { icon: IconName; label: string; detail: string; permission: ScreenPermission }[] = [
  {
    icon: 'swap-horizontal-outline',
    label: 'Transfers',
    detail: 'Dispatch and receive between locations',
    permission: 'view.inventory.transfers',
  },
  {
    icon: 'cart-outline',
    label: 'Purchases',
    detail: 'Purchase orders and goods receipt',
    permission: 'view.purchases',
  },
  {
    icon: 'arrow-undo-outline',
    label: 'Returns & orders',
    detail: 'Sales returns, reserved orders',
    permission: 'view.sales.returns',
  },
  {
    icon: 'pricetags-outline',
    label: 'Products & masters',
    detail: 'SKUs, categories, taxes, customers',
    permission: 'view.onboarding.products',
  },
  {
    icon: 'people-outline',
    label: 'Users & roles',
    detail: 'Access and permissions',
    permission: 'view.onboarding.users',
  },
  {
    icon: 'settings-outline',
    label: 'Administration',
    detail: 'Company settings and audit log',
    permission: 'view.admin',
  },
];

export default function MoreScreen() {
  const colors = useTheme();
  const mode = useThemeMode();
  const router = useRouter();

  const user = useSessionStore((s) => s.user);
  const store = useSessionStore((s) => s.store);
  const counterId = useSessionStore((s) => s.counterId);
  const setTheme = useSessionStore((s) => s.setTheme);
  const logout = useLogout();

  const company = useCompany();

  const role = useCurrentRole();
  const canBill = useCan('sales.bill');
  const permissions = usePermissions();
  const [changingPassword, setChangingPassword] = useState(false);
  // A password an administrator chose is a handover, not a secret: the sheet
  // opens itself and will not dismiss until they pick their own.
  const mustChange = useMustChangePassword();
  const webItems = ON_WEB.filter((item) => permissions.has(item.permission));

  const signOut = () => {
    logout();
    router.replace('/');
  };

  return (
    <ScrollScreen>
      <Card>
        <CardBody style={styles.profile}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.initials, { color: colors.primaryForeground }]}>
              {initials(user?.name)}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text style={[styles.name, { color: colors.foreground }]}>{user?.name ?? '—'}</Text>
            <Text style={[styles.email, { color: colors.mutedForeground }]} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
            <Text style={[styles.email, { color: colors.mutedForeground }]} numberOfLines={1}>
              {company.data?.name ?? ''}
            </Text>
          </View>
          {role ? <Badge label={role.name} tone="info" /> : null}
        </CardBody>
      </Card>

      {canBill ? (
        <Card>
          <CardHeader title="Records" />
          <CardBody style={styles.webList}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Invoices"
              onPress={() => router.push('/invoices')}
              style={({ pressed }) => [styles.webRow, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="receipt-outline" size={20} color={colors.mutedForeground} />
              <View style={styles.webText}>
                <Text style={[styles.switchLabel, { color: colors.foreground }]}>Invoices</Text>
                <Text style={[styles.email, { color: colors.mutedForeground }]}>
                  Every bill for a day, and what is still owed
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </Pressable>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Appearance" />
        <CardBody>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={[styles.switchLabel, { color: colors.foreground }]}>Dark theme</Text>
              <Text style={[styles.email, { color: colors.mutedForeground }]}>
                Easier on the eyes in a dim stockroom.
              </Text>
            </View>
            <Switch
              value={mode === 'dark'}
              onValueChange={(on) => setTheme(on ? 'dark' : 'light')}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </CardBody>
      </Card>

      {webItems.length > 0 ? (
        <View>
          <SectionTitle title="On the web app" />
          <Card style={{ marginTop: spacing.sm }}>
            <CardBody style={styles.webList}>
              {webItems.map((item, index) => (
                <View key={item.label}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.webRow}>
                    <Ionicons name={item.icon} size={20} color={colors.mutedForeground} />
                    <View style={styles.webText}>
                      <Text style={[styles.switchLabel, { color: colors.foreground }]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.email, { color: colors.mutedForeground }]}>
                        {item.detail}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </CardBody>
          </Card>
        </View>
      ) : null}

      <Card>
        <CardHeader title="Account" />
        <CardBody>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change password"
            onPress={() => setChangingPassword(true)}
            style={({ pressed }) => [styles.accountRow, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="key-outline" size={20} color={colors.mutedForeground} />
            <View style={styles.accountText}>
              <Text style={[styles.accountLabel, { color: colors.foreground }]}>
                Change password
              </Text>
              <Text style={[styles.accountDetail, { color: colors.mutedForeground }]}>
                Signs out every other device
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Session" />
        <CardBody>
          {/* Read-only: the header switcher is the one place a store changes,
              so it can guard a running bill without a second path around it. */}
          <Row label="Selling store" value={store?.name ?? '—'} muted />
          <Row label="Counter" value={counterId} muted />
          <Row label="Data source" value="In-memory mock" muted />
        </CardBody>
      </Card>

      <Button label="Sign out" icon="log-out-outline" variant="danger" size="lg" block onPress={signOut} />

      <ChangePasswordSheet
        visible={mustChange || changingPassword}
        forced={mustChange}
        onClose={() => setChangingPassword(false)}
      />
    </ScrollScreen>
  );
}

const initials = (name: string | undefined) =>
  (name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const styles = StyleSheet.create({
  // 48dp minimum, like every other tappable thing in this app.
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  accountText: { flex: 1 },
  accountLabel: { fontSize: fontSize.base, fontWeight: '600' },
  accountDetail: { fontSize: fontSize.sm, marginTop: 1 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: fontSize.lg, fontWeight: '700' },
  profileText: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.lg, fontWeight: '700' },
  email: { fontSize: fontSize.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchText: { flex: 1, gap: 2 },
  switchLabel: { fontSize: fontSize.base, fontWeight: '600' },
  webList: { gap: 0, paddingVertical: 0 },
  webRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  webText: { flex: 1, gap: 2 },
});
