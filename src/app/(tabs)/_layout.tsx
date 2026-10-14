import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors, Fonts, BottomNavHeight } from '@/constants/theme';
import { ChatSheet } from '@/components/chat/ChatSheet';
import { onAskAssistant } from '@/lib/ask-assistant';
import { ChatProvider, useChatSheet } from '@/lib/chat-context';

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 20 20" fill="none">
      <Path d="M3 9l7-6 7 6v7a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1V9z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  );
}
function ChatIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 20 20" fill="none">
      <Path
        d="M18 10c0 4.418-3.582 8-8 8a7.96 7.96 0 01-4-.107L2 19l1.107-4A7.96 7.96 0 012 10C2 5.582 5.582 2 10 2s8 3.582 8 8z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function CryptoIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7.5} stroke={color} strokeWidth={1.8} />
      <Path d="M8 6v8M12 6v8M7 8h5a1.5 1.5 0 010 3H7m0 0h5.5a1.5 1.5 0 010 3H7" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
function ProfileIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={6.5} r={3.5} stroke={color} strokeWidth={1.8} />
      <Path d="M3 18c.8-3.6 3.8-6 7-6s6.2 2.4 7 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Everything the navigator is given is constant (module-level objects, a listeners object made once). The chat context changes
 * constantly (balances loading, messages streaming), and this component used to re-render with it, handing the navigator brand
 * new `options` and `listeners` objects every time. Opening a hidden tab (Shar, Network) while data was still loading could then
 * set off "Maximum update depth exceeded" inside BottomTabNavigator. Now this component never re-renders on chat changes: a tiny
 * bridge below keeps a ref pointing at the current `openChat`.
 */
const SCREEN_OPTIONS = {
  headerShown: false,
  tabBarActiveTintColor: Colors.blueBright,
  // Light enough to read on the dark bar; the open tab is told apart by its colour alone, like a plain system bar (no pill or box).
  tabBarInactiveTintColor: '#C9C8BD',
  tabBarItemStyle: { paddingTop: 8, paddingBottom: 6 },
  tabBarStyle: {
    backgroundColor: Colors.bg1,
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: BottomNavHeight,
    elevation: 0,
  },
  tabBarIconStyle: { marginBottom: 2 },
  tabBarLabelStyle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11.5,
    letterSpacing: 0.1,
  },
} as const;

const HOME_OPTIONS = { title: 'Home', tabBarIcon: ({ color }: { color: ColorValue }) => <HomeIcon color={String(color)} /> };
const CRYPTO_OPTIONS = { title: 'Crypto', tabBarIcon: ({ color }: { color: ColorValue }) => <CryptoIcon color={String(color)} /> };
const CHAT_OPTIONS = { title: 'AI Chat', tabBarIcon: ({ color }: { color: ColorValue }) => <ChatIcon color={String(color)} /> };
const PROFILE_OPTIONS = { title: 'Profile', tabBarIcon: ({ color }: { color: ColorValue }) => <ProfileIcon color={String(color)} /> };
// Shar rewards and the open provider network: opened from Home and Profile, not from the tab bar.
const HIDDEN_OPTIONS = { href: null } as const;

type OpenChat = ReturnType<typeof useChatSheet>['openChat'];

/** Renders nothing; keeps `target.current` pointing at the latest openChat without making its parent re-render. */
function OpenChatBridge({ target }: { target: { current: OpenChat | null } }) {
  const { openChat } = useChatSheet();
  target.current = openChat;
  // Screens outside the tabs (the FAQ) ask the assistant through here, since the sheet lives in this layout.
  useEffect(() => onAskAssistant((prompt) => target.current?.(prompt)), [target]);
  return null;
}

function TabsWithChat() {
  const openChatRef = useRef<OpenChat | null>(null);
  const chatListeners = useMemo(
    () => ({
      // AI Chat is a sheet over the current screen (like the web chat), not a page of its own.
      tabPress: (e: { preventDefault: () => void }) => {
        e.preventDefault();
        openChatRef.current?.();
      },
    }),
    [],
  );

  return (
    <>
      <OpenChatBridge target={openChatRef} />
      <Tabs screenOptions={SCREEN_OPTIONS}>
        <Tabs.Screen name="index" options={HOME_OPTIONS} />
        <Tabs.Screen name="crypto" options={CRYPTO_OPTIONS} />
        <Tabs.Screen name="chat" options={CHAT_OPTIONS} listeners={chatListeners} />
        <Tabs.Screen name="profile" options={PROFILE_OPTIONS} />
        <Tabs.Screen name="shar" options={HIDDEN_OPTIONS} />
        <Tabs.Screen name="network" options={HIDDEN_OPTIONS} />
        <Tabs.Screen name="admin" options={HIDDEN_OPTIONS} />
      </Tabs>
      <ChatSheet />
    </>
  );
}

export default function TabsLayout() {
  return (
    <ChatProvider>
      <TabsWithChat />
    </ChatProvider>
  );
}
