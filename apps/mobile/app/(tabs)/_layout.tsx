import { Ionicons } from '@expo/vector-icons';
import { useCan, useCanAny, useCartCount, useSessionStore } from '@shop/state';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { StoreSwitcher } from '@/components/store-switcher';
import { fontSize, useTheme } from '@/lib/theme';

/**
 * Five thumb-reachable tabs mirroring the web taxonomy, collapsed to what a
 * person actually does away from a desk. Billing sits in the middle — it is the
 * reason the app is open — and carries a live cart badge so a half-finished
 * sale is never invisible. Purchases, Onboarding and Administration are desk
 * work and live under More rather than spending a tab each.
 *
 * Tabs are gated on the signed-in user's role. `Tabs.Protected` removes the
 * route from the navigator outright rather than merely hiding the button, so a
 * deep link into a screen the user may not see has nowhere to land. Home and
 * More are ungated — every user needs somewhere to start and a way to sign out.
 */
export default function TabsLayout() {
  const colors = useTheme();
  const signedIn = useSessionStore((s) => s.user !== null);
  const cartCount = useCartCount();

  const canBill = useCan('sales.bill');
  const canViewInventory = useCan('inventory.view');
  const canClose = useCanAny(['closing.perform', 'closing.approve']);

  if (!signedIn) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontSize: fontSize.lg, fontWeight: '700' },
        headerShadowVisible: false,
        // Every tab is scoped to the selling store, so the control that changes
        // it belongs in the chrome rather than on any one screen.
        headerRight: () => <StoreSwitcher />,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
        tabBarBadgeStyle: { backgroundColor: colors.destructive, color: colors.destructiveForeground },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Protected guard={canBill}>
        <Tabs.Screen
          name="bill"
          options={{
            title: 'Bill',
            tabBarBadge: cartCount > 0 ? cartCount : undefined,
            tabBarAccessibilityLabel:
              cartCount > 0 ? `Bill, ${cartCount} items in cart` : 'Bill',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />
            ),
          }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={canViewInventory}>
        <Tabs.Screen
          name="stock"
          options={{
            title: 'Stock',
            // The only tab that does not follow the selling store — it carries
            // its own location picker, and two disagreeing scopes in one header
            // is how someone counts the wrong shelf.
            headerRight: () => null,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'cube' : 'cube-outline'} size={size} color={color} />
            ),
          }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={canClose}>
        <Tabs.Screen
          name="closing"
          options={{
            title: 'Closing',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? 'checkmark-done-circle' : 'checkmark-done-circle-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tabs.Protected>
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
