import { Tabs } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors, Type, BottomNavHeight } from '@/constants/theme';
import { ChatSheet } from '@/components/chat/ChatSheet';
import { ChatProvider, useChatSheet } from '@/lib/chat-context';
import { WalletConnectionProvider } from '@/lib/wallet-connection';

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M3 9l7-6 7 6v7a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1V9z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}
function ChatIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M18 10c0 4.418-3.582 8-8 8a7.96 7.96 0 01-4-.107L2 19l1.107-4A7.96 7.96 0 012 10C2 5.582 5.582 2 10 2s8 3.582 8 8z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function CryptoIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7.5} stroke={color} strokeWidth={1.5} />
      <Path d="M8 6v8M12 6v8M7 8h5a1.5 1.5 0 010 3H7m0 0h5.5a1.5 1.5 0 010 3H7" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}
function ProfileIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={6.5} r={3.5} stroke={color} strokeWidth={1.5} />
      <Path d="M3 18c.8-3.6 3.8-6 7-6s6.2 2.4 7 6" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function TabsWithChat() {
  const { openChat } = useChatSheet();
  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.blue,
        tabBarInactiveTintColor: Colors.tx1,
        tabBarStyle: {
          backgroundColor: Colors.bg1,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: BottomNavHeight,
        },
        tabBarLabelStyle: {
          fontFamily: Type.label.fontFamily,
          fontSize: Type.label.fontSize,
          letterSpacing: Type.label.letterSpacing,
          textTransform: Type.label.textTransform,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeIcon color={String(color)} /> }} />
      <Tabs.Screen name="crypto" options={{ title: 'Crypto', tabBarIcon: ({ color }) => <CryptoIcon color={String(color)} /> }} />
      <Tabs.Screen
        name="chat"
        options={{ title: 'AI Chat', tabBarIcon: ({ color }) => <ChatIcon color={String(color)} /> }}
        listeners={{
          // AI Chat is a sheet over the current screen (like the web chat), not a page of its own.
          tabPress: (e) => {
            e.preventDefault();
            openChat();
          },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <ProfileIcon color={String(color)} /> }} />
    </Tabs>
    <ChatSheet />
    </>
  );
}

export default function TabsLayout() {
  return (
    <WalletConnectionProvider>
      <ChatProvider>
        <TabsWithChat />
      </ChatProvider>
    </WalletConnectionProvider>
  );
}
