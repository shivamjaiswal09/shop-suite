import { Ionicons } from '@expo/vector-icons';
import type { Permission } from '@shop/core';
import {
  useCan,
  useCompany,
  useCurrentRole,
  useLogout,
  usePermissions,
  useSessionStore,
} from '@shop/state';
import { useRouter } from 'expo-router';
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
import { fontSize, spacing, useTheme, useThemeMode } from '@/lib/theme';

/**
 * Desk work the phone deliberately does not try to replace — stated plainly,
 * and only the parts this user's role could actually reach on the web app.
 * Listing Administration to a cashier would just be advertising a locked door.
 */
const ON_WEB: { icon: IconName; label: string; detail: string; permission: Permission }[] = [
  {
    icon: 'swap-horizontal-outline',
    label: 'Transfers',
    detail: 'Dispatch and receive between locations',
    permission: 'inventory.adjust',
  },
  {
    icon: 'cart-outline',
    label: 'Purchases',
    detail: 'Purchase orders and goods receipt',
    permission: 'purchase.manage',
  },
  {
    icon: 'arrow-undo-outline',
    label: 'Returns & orders',
    detail: 'Sales returns, reserved orders',
    permission: 'sales.refund',
  },
  {
    icon: 'pricetags-outline',
    label: 'Products & masters',
    detail: 'SKUs, categories, taxes, customers',
    permission: 'inventory.adjust',
  },
  {
    icon: 'people-outline',
    label: 'Users & roles',
    detail: 'Access and permissions',
    permission: 'admin.manage',
  },
  {
    icon: 'settings-outline',
    label: 'Administration',
    detail: 'Company settings and audit log',
    permission: 'admin.manage',
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
