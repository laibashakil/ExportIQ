import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import ComplianceScreen from './screens/ComplianceScreen';
import ActionCenterScreen from './screens/ActionCenterScreen';
import DocumentVaultScreen from './screens/DocumentVaultScreen';
import AgentTraceScreen from './screens/AgentTraceScreen';
import UploadScreen from './screens/UploadScreen';
import AnalysisProgressScreen from './screens/AnalysisProgressScreen';
import HowItWorksScreen from './screens/HowItWorksScreen';
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
  Status:    { active: 'shield-checkmark', inactive: 'shield-checkmark-outline' },
  'Fix It':  { active: 'flash',            inactive: 'flash-outline' },
  Documents: { active: 'document-text',    inactive: 'document-text-outline' },
};

function tabIcon(routeName) {
  return ({ focused, color, size }) => {
    const set = TAB_ICON[routeName] || TAB_ICON.Status;
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
          height: 68,
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        tabBarIcon: tabIcon(r.name),
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
      })}
    >
      <Tab.Screen name="Status"    initialParams={{ factoryId }} component={ComplianceScreen} />
      <Tab.Screen name="Fix It"    initialParams={{ factoryId }} component={ActionCenterScreen} />
      <Tab.Screen name="Documents" initialParams={{ factoryId }} component={DocumentVaultScreen} />
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
            name="Splash"
            component={SplashScreen}
            options={{ headerShown: false }}
          />
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
          <Stack.Screen
            name="DevTrace"
            component={AgentTraceScreen}
            options={{ title: 'Agent Trace (Dev)' }}
          />
          <Stack.Screen
            name="Upload"
            component={UploadScreen}
            options={({ route }) => ({
              title: route.params?.factoryName || 'Upload',
            })}
          />
          <Stack.Screen
            name="AnalysisProgress"
            component={AnalysisProgressScreen}
            options={{ title: 'Checking your factory', headerBackVisible: false }}
          />
          <Stack.Screen
            name="HowItWorks"
            component={HowItWorksScreen}
            options={{ title: 'How it works' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
