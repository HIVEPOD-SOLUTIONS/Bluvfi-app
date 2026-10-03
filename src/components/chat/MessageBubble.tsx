import { Linking, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';

/** The user's message: a right-aligned bubble. The assistant's: plain markdown text with no bubble. */
export function MessageBubble({ role, text }: { role: string; text: string }) {
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
          Linking.openURL(url);
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
