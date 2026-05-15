import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import HomeScreen from './screens/HomeScreen';
import ComplianceScreen from './screens/ComplianceScreen';
import ActionCenterScreen from './screens/ActionCenterScreen';
import DocumentVaultScreen from './screens/DocumentVaultScreen';
import BuyerCommsScreen from './screens/BuyerCommsScreen';
import AgentTraceScreen from './screens/AgentTraceScreen';
import { colors } from './constants/colors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700' },
  contentStyle: { backgroundColor: colors.bg },
};

function FactoryTabs({ route }) {
  const { factoryId } = route.params;
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
      }}
    >
      <Tab.Screen
        name="Compliance"
        initialParams={{ factoryId }}
        component={ComplianceScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>◉</Text> }}
      />
      <Tab.Screen
        name="Actions"
        initialParams={{ factoryId }}
        component={ActionCenterScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>▶</Text> }}
      />
      <Tab.Screen
        name="Docs"
        initialParams={{ factoryId }}
        component={DocumentVaultScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>▤</Text> }}
      />
      <Tab.Screen
        name="Buyers"
        initialParams={{ factoryId }}
        component={BuyerCommsScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>✉</Text> }}
      />
      <Tab.Screen
        name="Trace"
        initialParams={{ factoryId }}
        component={AgentTraceScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>◷</Text> }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
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
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'ExportIQ' }} />
        <Stack.Screen
          name="Factory"
          component={FactoryTabs}
          options={({ route }) => ({ title: route.params?.factoryName || 'Factory' })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
