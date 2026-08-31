import { Ionicons } from '@expo/vector-icons';
import { useLogin, useSessionStore } from '@shop/state';
import { Redirect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '@/components/ui';
import { elevation, fontSize, radius, spacing, touch, useTheme } from '@/lib/theme';
import { useState } from 'react';

/**
 * Signs in through the very same `useLogin` hook the web app uses. Phase 1 auth
 * is email-only, so the demo accounts are one tap each — typing an email on a
 * phone to see a demo is friction with no purpose.
 */
export default function LoginScreen() {
  const colors = useTheme();
  const isAuthenticated = useSessionStore((s) => s.user !== null);
  const login = useLogin();
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');

  if (isAuthenticated) return <Redirect href="/(tabs)/home" />;

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && password) login.mutate({ email: trimmed, password });
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Ionicons name="storefront" size={30} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Shop Suite</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sales & inventory, at the counter
          </Text>
        </View>

        <View style={styles.list}>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            autoCapitalize="none"
            secureTextEntry
            onSubmitEditing={() => submit(email)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            disabled={login.isPending || !email || !password}
            onPress={() => submit(email)}
            style={({ pressed }) => [
              styles.submit,
              elevation.card,
              {
                backgroundColor: colors.primary,
                opacity: login.isPending || !email || !password ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '600' }}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Text>
          </Pressable>

          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Your administrator creates your account and sets your password.
          </Text>
        </View>

        <View style={styles.divider}>
          <View style={[styles.rule, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
          <View style={[styles.rule, { backgroundColor: colors.border }]} />
        </View>

        <Input
          icon="mail-outline"
          placeholder="your.name@company.in"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => submit(email)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="go"
          editable={!login.isPending}
        />

        {login.error ? (
          <View style={[styles.error, { backgroundColor: colors.destructive }]}>
            <Ionicons name="alert-circle" size={16} color={colors.destructiveForeground} />
            <Text style={[styles.errorText, { color: colors.destructiveForeground }]}>
              {(login.error as Error).message}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Auth, data and pricing all come from the shared @shop packages.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  submit: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: touch.lg,
    justifyContent: 'center',
  },
  hint: { fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.sm },
  screen: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  header: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: '700' },
  subtitle: { fontSize: fontSize.sm },
  list: { gap: spacing.md },
  card: {
    minHeight: touch.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: fontSize.base, fontWeight: '600' },
  cardMeta: { fontSize: fontSize.xs },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1, fontSize: fontSize.sm, fontWeight: '500' },
  footer: { fontSize: fontSize.xs, textAlign: 'center', lineHeight: 16 },
});
