import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetch as expoFetch } from 'expo/fetch';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { ToolResultCard } from '@/components/chat/ToolResultCard';
import { FundWalletCard } from '@/components/chat/FundWalletCard';
import { Colors, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { API_BASE_URL } from '@/lib/api';

type ToolPart = { type: string; toolCallId: string; state: string; input?: unknown; output?: unknown };

function isToolPart(part: { type: string }): part is ToolPart {
  return part.type.startsWith('tool-') && 'toolCallId' in part;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { getAccessToken, evmAddress, solanaAddress } = useAuth();
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE_URL}/api/chat`,
        body: { walletAddress: evmAddress, solanaAddress },
        headers: async () => {
          const token = await getAccessToken();
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return headers;
        },
        // expo/fetch supports streaming response bodies, which React
        // Native's built-in fetch historically does not — needed for the
        // AI SDK's streamed text to arrive incrementally rather than all
        // at once at the end.
        fetch: expoFetch as unknown as typeof globalThis.fetch,
      }),
    [evmAddress, solanaAddress, getAccessToken],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });
  const isBusy = status === 'submitted' || status === 'streaming';

  // Dashboard shortcuts ("Ask AI to find products", Buy…) open this tab with a prompt to send straight
  // away — like the web's sendMessage() + openChat(). `n` makes repeating the same prompt send again.
  const { prompt, n } = useLocalSearchParams<{ prompt?: string; n?: string }>();
  const sentPromptKey = useRef<string | null>(null);
  useEffect(() => {
    if (!prompt) return;
    const key = `${n ?? ''}:${prompt}`;
    if (sentPromptKey.current === key) return;
    sentPromptKey.current = key;
    sendMessage({ text: prompt });
  }, [prompt, n, sendMessage]);

  const handleSend = () => {
    if (!input.trim() || isBusy) return;
    sendMessage({ text: input.trim() });
    setInput('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Logo size={20} />
        <Text style={styles.headerTitle}>AI Chat</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>I'm Bluvfi, your financial assistant.</Text>
            <Text style={styles.emptySubtitle}>Ask me to check your portfolio, review your bills, or explain a transaction.</Text>
          </View>
        )}

        {messages.map((message) => (
          <View key={message.id} style={styles.messageGroup}>
            {message.parts.map((part, i) => {
              if (part.type === 'text' && part.text) {
                return (
                  <View
                    key={i}
                    style={[styles.bubble, message.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}
                  >
                    <Text style={[styles.bubbleText, message.role === 'user' && styles.bubbleTextUser]}>
                      {part.text}
                    </Text>
                  </View>
                );
              }
              if (part.type === 'reasoning') return null;
              if (isToolPart(part)) {
                const toolName = part.type.slice(5);
                if (part.state !== 'output-available' || !part.output) {
                  return (
                    <View key={part.toolCallId} style={[styles.bubble, styles.bubbleAssistant]}>
                      <Text style={styles.toolNote}>Working on it…</Text>
                    </View>
                  );
                }
                if (toolName === 'open_fund_wallet') {
                  return <FundWalletCard key={part.toolCallId} />;
                }
                return <ToolResultCard key={part.toolCallId} toolName={toolName} output={part.output} />;
              }
              return null;
            })}
          </View>
        ))}

        {isBusy && (
          <View style={[styles.bubble, styles.bubbleAssistant]}>
            <Text style={styles.toolNote}>Thinking…</Text>
          </View>
        )}

        {error && <Text style={styles.error}>Something went wrong. Try again.</Text>}
      </ScrollView>

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TextInput
          style={styles.input}
          placeholder="Ask Bluvfi anything…"
          placeholderTextColor={Colors.tx2}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Button size="sm" onPress={handleSend} disabled={!input.trim() || isBusy}>
          Send
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    ...Type.h2,
    color: Colors.tx0,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  messageGroup: {
    gap: Spacing.sm,
  },
  empty: {
    paddingVertical: Spacing.xxxl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    ...Type.h1,
    color: Colors.tx0,
  },
  emptySubtitle: {
    ...Type.body,
    color: Colors.tx1,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.blue,
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.bg1,
  },
  bubbleText: {
    ...Type.body,
    color: Colors.tx0,
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  toolNote: {
    ...Type.small,
    color: Colors.tx1,
    fontStyle: 'italic',
  },
  error: {
    ...Type.body,
    color: Colors.redAlert,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg1,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.bg2,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    color: Colors.tx0,
    fontFamily: Type.body.fontFamily,
    fontSize: 14,
  },
});
