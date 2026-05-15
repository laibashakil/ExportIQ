import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './screens/HomeScreen';
import ComplianceScreen from './screens/ComplianceScreen';
import ActionCenterScreen from './screens/ActionCenterScreen';
import DocumentVaultScreen from './screens/DocumentVaultScreen';
import BuyerCommsScreen from './screens/BuyerCommsScreen';
import AgentTraceScreen from './screens/AgentTraceScreen';
import { colors } from './constants/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const stackOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '800', fontSize: 17 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

const TAB_ICON = {
  Compliance: { active: 'shield-checkmark', inactive: 'shield-checkmark-outline' },
  Actions:    { active: 'flash',             inactive: 'flash-outline' },
  Docs:       { active: 'document-text',     inactive: 'document-text-outline' },
  Buyers:     { active: 'briefcase',         inactive: 'briefcase-outline' },
  Trace:      { active: 'git-network',       inactive: 'git-network-outline' },
};

function tabIcon(routeName) {
  return ({ focused, color, size }) => {
    const set = TAB_ICON[routeName] || TAB_ICON.Compliance;
    return (
      <Ionicons
        name={focused ? set.active : set.inactive}
        size={size}
        color={color}
      />
    );
  };
}

function FactoryTabs({ route }) {
  const { factoryId } = route.params;
  return (
    <Tab.Navigator
      screenOptions={({ route: r }) => ({
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        tabBarIcon: tabIcon(r.name),
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
      })}
    >
      <Tab.Screen name="Compliance" initialParams={{ factoryId }} component={ComplianceScreen} />
      <Tab.Screen name="Actions" initialParams={{ factoryId }} component={ActionCenterScreen} />
      <Tab.Screen name="Docs" initialParams={{ factoryId }} component={DocumentVaultScreen} />
      <Tab.Screen name="Buyers" initialParams={{ factoryId }} component={BuyerCommsScreen} />
      <Tab.Screen name="Trace" initialParams={{ factoryId }} component={AgentTraceScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: colors.primary,
            background: colors.bg,
            card: colors.surface,
            text: colors.text,
            border: colors.border,
            notification: colors.warning,
          },
        }}
      >
        <StatusBar style="light" />
        <Stack.Navigator screenOptions={stackOptions}>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Factory"
            component={FactoryTabs}
            options={({ route }) => ({ title: route.params?.factoryName || 'Factory' })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
