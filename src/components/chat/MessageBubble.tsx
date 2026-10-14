import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { useChatSheet } from '@/lib/chat-context';
import { isCreatorOnlyRoute } from '@/lib/creator-only';
import { useIsCreator } from '@/hooks/use-shar';

/** The only in-app destinations the agent may link to (see the app section of the server's prompt). */
const APP_LINKS: Record<string, string> = {
  'bluvfi://crypto': '/crypto',
  'bluvfi://profile': '/profile',
  'bluvfi://home': '/',
  'bluvfi://shar': '/shar',
  'bluvfi://network': '/network',
  'bluvfi://faq': '/faq',
  'bluvfi://activity': '/activity',
  'bluvfi://creator': '/creator',
  'bluvfi://invite': '/invite',
  'bluvfi://spark': '/spark',
};

/** A provider the agent found: bluvfi://provider/<uuid>. Only a real id shape is followed. */
const PROVIDER_LINK = /^bluvfi:\/\/provider\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/** The user's message: a right-aligned bubble. The assistant's: plain markdown text with no bubble. */
export function MessageBubble({ role, text }: { role: string; text: string }) {
  const { closeChat } = useChatSheet();
  const isCreator = useIsCreator();
  if (!text.trim()) return null;

  if (role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <Markdown
        style={markdownStyles}
        onLinkPress={(url) => {
          const screen = APP_LINKS[url.toLowerCase().replace(/\/+$/, '')];
          const provider = PROVIDER_LINK.exec(url)?.[1];
          if (screen && !isCreator && isCreatorOnlyRoute(screen)) {
            // Shar, Activity and Help are for creators; the link does nothing for anyone else.
          } else if (screen) {
            closeChat();
            router.navigate(screen as never);
          } else if (provider) {
            closeChat();
            router.navigate({ pathname: '/provider/[id]', params: { id: provider } } as never);
          } else if (!url.toLowerCase().startsWith('bluvfi://')) {
            Linking.openURL(url);
          }
          return false;
        }}
      >
        {text}
      </Markdown>
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: {
    alignItems: 'flex-end',
    marginVertical: 4,
  },
  userBubble: {
    maxWidth: '80%',
    backgroundColor: Colors.blue,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
  },
  userText: {
    ...Type.body,
    color: '#FFFFFF',
  },
  assistantRow: {
    maxWidth: '92%',
    marginVertical: 4,
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    ...Type.body,
    color: Colors.tx0,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  strong: {
    fontFamily: Fonts.sansSemiBold,
  },
  em: {
    fontStyle: 'italic',
  },
  heading1: { ...Type.h1, color: Colors.tx0, marginVertical: 6 },
  heading2: { ...Type.h2, color: Colors.tx0, marginVertical: 6 },
  heading3: { ...Type.h3, color: Colors.tx0, marginVertical: 4 },
  bullet_list: { marginBottom: 6 },
  ordered_list: { marginBottom: 6 },
  list_item: { marginVertical: 2 },
  bullet_list_icon: { color: Colors.sage, marginRight: 8 },
  ordered_list_icon: { color: Colors.sage, marginRight: 8 },
  link: { color: Colors.sage, textDecorationLine: 'underline' },
  code_inline: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    backgroundColor: Colors.bg2,
    color: Colors.tx0,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  fence: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    backgroundColor: Colors.bg1,
    color: Colors.tx0,
    borderRadius: Radii.md,
    padding: Spacing.md,
    borderWidth: 0,
  },
  code_block: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    backgroundColor: Colors.bg1,
    color: Colors.tx0,
    borderRadius: Radii.md,
    padding: Spacing.md,
    borderWidth: 0,
  },
  hr: { backgroundColor: Colors.border, height: 1, marginVertical: 8 },
  table: { borderColor: Colors.border },
  th: { padding: 6 },
  td: { padding: 6 },
  tr: { borderColor: Colors.border },
});
