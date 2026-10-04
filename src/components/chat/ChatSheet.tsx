import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Logo } from '@/components/ui/Logo';
import { Colors, Radii, Spacing, Type } from '@/constants/theme';
import { showRewardedAd } from '@/lib/admob';
import { usePremium } from '@/components/profile/ProfileContent';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { MicButton, VoiceBar } from './VoiceBar';
import { API_BASE_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useChatSheet } from '@/lib/chat-context';
import { getTimeBasedGreeting } from '@/lib/greeting';
import { BitrefillPaymentCard } from './BitrefillPaymentCard';
import { CryptorefillsPaymentCard } from './CryptorefillsPaymentCard';
import { DomaListingCard } from './DomaListingCard';
import { DomaPaymentCard } from './DomaPaymentCard';
import { GetEquityPaymentCard } from './GetEquityPaymentCard';
import { StockTradeCard } from './StockTradeCard';
import { MessageBubble } from './MessageBubble';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ToolResultCard } from './ToolResultCard';

type ToolPart = { type: string; toolCallId: string; state: string; input?: unknown; output?: unknown };

function isToolPart(part: { type: string }): part is ToolPart {
  return part.type.startsWith('tool-') && 'toolCallId' in part;
}

const DISMISS_DRAG_PX = 110;
const SHEET_HEIGHT_RATIO = 0.85;

/** open_fund_wallet calls already acted on, so re-opening the sheet doesn't pop the wallet up again. */
const handledWalletCalls = new Set<string>();

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
      <Path d="M10 16V4M10 4l-5 5M10 4l5 5" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * The AI chat, as a sheet that slides up over the dashboard (like the web chat): Bluvfi mark and BETA
 * tag at the top, the conversation, and the "Ask Bluvfi anything…" bar. Text only; there is no voice input.
 */
export function ChatSheet() {
  const insets = useSafeAreaInsets();
  const { firstName, getAccessToken, userId } = useAuth();
  const { open, closeChat, messages, status, isBusy, send, dailyLimitHit, clearDailyLimit, limitNotice, remainingToday, openWallet } = useChatSheet();
  const { isPremium } = usePremium();
  // Voice input: the transcript is sent to the chat as if it had been typed.
  const voice = useVoiceInput(send);
  const cancelVoice = voice.cancel;
  // Closing the sheet mid-recording drops the recording rather than leaving the mic open.
  useEffect(() => {
    if (!open) void cancelVoice();
  }, [open, cancelVoice]);
  const [adBusy, setAdBusy] = useState(false);
  const [adNote, setAdNote] = useState<string | null>(null);

  const windowHeight = Dimensions.get('window').height;
  const sheetHeight = Math.round(windowHeight * SHEET_HEIGHT_RATIO);

  // Keep the Modal mounted through the close animation.
  const [mounted, setMounted] = useState(open);
  const slide = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
  const drag = useRef(new Animated.Value(0)).current;
  const [input, setInput] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const following = useRef(true);

  useEffect(() => {
    if (open) {
      setMounted(true);
      drag.setValue(0);
      Animated.timing(slide, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    } else {
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, slide, drag]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // The assistant's open_fund_wallet tool asks the app to show the Wallet sheet (the web does the same
  // with a window event). Close the chat first so the wallet sheet isn't hidden behind it.
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolPart(part) || part.type.slice(5) !== 'open_fund_wallet') continue;
        if (part.state !== 'output-available' || handledWalletCalls.has(part.toolCallId)) continue;
        handledWalletCalls.add(part.toolCallId);
        closeChat();
        setTimeout(openWallet, 350);
      }
    }
  }, [messages, closeChat, openWallet]);

  // Drag the handle down to dismiss.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_DRAG_PX || g.vy > 1.2) {
            Keyboard.dismiss();
            closeChat();
          } else {
            Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
          }
        },
      }),
    [drag, closeChat],
  );

  // Follow the newest content unless the user has scrolled up to read.
  const onScroll = (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    following.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
  };

  // Claim the bonus for a finished ad. With server-side verification on, the server answers 202 until Google's own
  // callback has confirmed the ad (usually a few seconds), so poll for it; otherwise it grants straight away.
  const claimBonus = async (amount: number) => {
    const token = await getAccessToken();
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await fetch(`${API_BASE_URL}/api/chat/bonus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ amount }),
      });
      if (res.status === 202) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (res.ok) {
        clearDailyLimit();
        return;
      }
      // e.g. today's ad bonuses are used up: say so, and keep the limit card up.
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setAdNote(data.error ?? "Couldn't unlock your messages. Please try again.");
      return;
    }
    setAdNote("We're still confirming your ad. Tap again in a moment, and your messages will unlock.");
  };

  // Daily limit hit: a rewarded ad unlocks more messages, as in the Capacitor app.
  const watchAd = async () => {
    setAdBusy(true);
    setAdNote(null);
    let earned = 0;
    const result = await showRewardedAd((amount) => {
      earned = amount;
    }, userId ? { userId } : undefined);
    if (result === 'unavailable') setAdNote('No ad is available right now. Please try again in a moment.');
    else if (result === 'rewarded' || earned > 0) {
      try {
        await claimBonus(earned || 5);
      } catch {
        setAdNote("Couldn't unlock your messages. Please try again.");
      }
    }
    setAdBusy(false);
  };

  const handleSend = () => {
    if (!input.trim() || isBusy) return;
    following.current = true;
    send(input);
    setInput('');
  };

  if (!mounted) return null;

  const greeting = getTimeBasedGreeting();
  const translateY = Animated.add(
    slide.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }),
    drag,
  );
  const lastMessage = messages[messages.length - 1];
  const showRetryNote =
    !dailyLimitHit && !limitNotice && !isBusy && messages.length > 0 && lastMessage?.role === 'user' && status !== 'submitted';

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={closeChat}>
      <Animated.View style={[styles.backdrop, { opacity: slide }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeChat} accessibilityLabel="Close chat" />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            height: Math.min(sheetHeight, windowHeight - keyboardHeight - insets.top - Spacing.md),
            bottom: keyboardHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        <View {...panResponder.panHandlers} style={styles.headerArea}>
          <View style={styles.grabber} />
          <Pressable onPress={closeChat} style={styles.brand} accessibilityRole="button" accessibilityLabel="Close chat">
            <Logo size={32} />
            <View style={styles.betaChip}>
              <Text style={styles.betaText}>Beta</Text>
            </View>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={64}
          onContentSizeChange={() => {
            if (following.current) scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          {messages.length === 0 && (
            <View style={styles.welcome}>
              <Text style={styles.welcomeTitle}>
                {greeting}
                {firstName ? `, ${firstName}` : ''}. 👋
              </Text>
              <Text style={styles.welcomeBody}>
                I'm Bluvfi, your financial assistant. Ask me to pay your bills, invest in stocks, or check your
                portfolio.
              </Text>
            </View>
          )}

          {messages.map((message) => {
            const hasText = message.parts.some((p) => p.type === 'text' && p.text.trim());
            const hasVisibleToolPart = message.parts.some((p) => {
              if (!isToolPart(p)) return false;
              if (p.type.slice(5) === 'open_fund_wallet') return false;
              return p.state === 'output-available' && !!p.output;
            });

            return (
              <View key={message.id}>
                {message.parts.map((part, i) => {
                  if (part.type === 'text') return <MessageBubble key={i} role={message.role} text={part.text} />;
                  if (part.type === 'reasoning') return null;
                  if (!isToolPart(part)) return null;

                  const toolName = part.type.slice(5);
                  if (toolName === 'open_fund_wallet') return null; // handled by the effect above

                  const out = part.output as Record<string, any> | undefined;
                  // Bitrefill invoice waiting on payment from this wallet (address-based methods are shown as info).
                  if (part.state === 'output-available' && out?.pendingBitrefillPayment === true && !out?.isAddressBased) {
                    return <BitrefillPaymentCard key={part.toolCallId} toolCallId={part.toolCallId} output={out as any} />;
                  }
                  // Cryptorefills checkout: the card runs the whole payment itself.
                  if (part.state === 'output-available' && out?.pendingCryptorefillsPayment === true) {
                    return <CryptorefillsPaymentCard key={part.toolCallId} toolCallId={part.toolCallId} output={out as any} />;
                  }
                  // GetEquity: card link or bank-transfer details to fund / fund-and-invest.
                  if (part.state === 'output-available' && out?.getEquityPayment === true) {
                    return <GetEquityPaymentCard key={part.toolCallId} output={out as any} />;
                  }
                  // Doma: pays a domain order's voucher on the Doma chain from the user's wallet.
                  if (part.state === 'output-available' && out?.domaPayment === true) {
                    return <DomaPaymentCard key={part.toolCallId} toolCallId={part.toolCallId} output={out as any} />;
                  }
                  // Doma marketplace: buys a listed domain (Seaport fill) from the user's wallet.
                  if (part.state === 'output-available' && out?.domaListingBuy === true) {
                    return <DomaListingCard key={part.toolCallId} toolCallId={part.toolCallId} output={out as any} />;
                  }
                  // Backpack stock trade: confirm card that pays and places the order.
                  if (part.state === 'output-available' && out?.pendingStockTrade === true) {
                    return <StockTradeCard key={part.toolCallId} toolCallId={part.toolCallId} output={out as any} />;
                  }
                  if (part.state === 'output-available' && part.output) {
                    return <ToolResultCard key={part.toolCallId} toolName={toolName} output={part.output} />;
                  }
                  return null;
                })}

                {message.role === 'assistant' && !hasText && isBusy && <ThinkingIndicator />}
                {message.role === 'assistant' && !hasText && !hasVisibleToolPart && !isBusy && (
                  <MessageBubble role="assistant" text="Let me try that again — could you rephrase?" />
                )}
              </View>
            );
          })}

          {/* Before the assistant's message exists */}
          {status === 'submitted' && <ThinkingIndicator />}

          {dailyLimitHit && (
            <View style={styles.limitCard}>
              <Text style={styles.limitTitle}>{isPremium ? 'Daily limit reached' : '📺 Daily limit reached'}</Text>
              <Text style={styles.limitSub}>
                {isPremium
                  ? "You've used all of today's messages. Your allowance renews 24 hours after your first message of the day."
                  : 'Watch a short ad to unlock more messages. Your allowance also renews 24 hours after your first message of the day.'}
              </Text>
              {adNote ? <Text style={styles.limitError}>{adNote}</Text> : null}
              {!isPremium && (
                <Pressable onPress={watchAd} disabled={adBusy} style={[styles.limitButton, adBusy && { opacity: 0.5 }]}>
                  <Text style={styles.limitButtonText}>{adBusy ? 'Loading ad…' : 'Watch Ad — Get More Messages'}</Text>
                </Pressable>
              )}
            </View>
          )}
          {limitNotice && !dailyLimitHit && <MessageBubble role="assistant" text={limitNotice} />}
          {showRetryNote && <MessageBubble role="assistant" text="Something went wrong — please try again." />}
        </ScrollView>

        {voice.error ? (
          <Pressable onPress={voice.permissionDenied ? voice.openSettings : voice.clearError}>
            <Text style={[styles.quotaHint, { color: Colors.redAlert }]}>
              {voice.error}
              {voice.permissionDenied ? ' Tap to open Settings.' : ''}
            </Text>
          </Pressable>
        ) : null}
        {remainingToday !== null && remainingToday <= 20 && !dailyLimitHit && (
          <Text style={styles.quotaHint}>
            {remainingToday === 0 ? 'Last message for today' : `${remainingToday} message${remainingToday === 1 ? '' : 's'} left today`}
          </Text>
        )}
        <View style={[styles.inputRow, { paddingBottom: keyboardHeight > 0 ? Spacing.md : insets.bottom + Spacing.md }]}>
          {voice.state !== 'idle' ? (
            <View style={{ flex: 1 }}>
              <VoiceBar
                state={voice.state}
                level={voice.level}
                onCancel={voice.cancel}
                onSend={() => {
                  following.current = true;
                  void voice.finish();
                }}
              />
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Ask Bluvfi anything…"
                placeholderTextColor={Colors.tx2}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                blurOnSubmit={false}
                editable={!dailyLimitHit}
              />
              {input.trim().length > 0 ? (
                <Pressable
                  onPress={handleSend}
                  disabled={isBusy}
                  style={[styles.sendButton, isBusy && { opacity: 0.5 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                >
                  <SendIcon />
                </Pressable>
              ) : (
                voice.available && <MicButton onPress={voice.start} disabled={dailyLimitHit || isBusy} />
              )}
            </>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.bg0,
    borderTopLeftRadius: Radii.xxxl,
    borderTopRightRadius: Radii.xxxl,
    borderTopWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  headerArea: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  betaChip: {
    backgroundColor: Colors.bg2,
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 5,
    marginTop: -2,
  },
  betaText: {
    ...Type.label,
    fontSize: 9,
    color: Colors.tx1,
  },
  messages: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  quotaHint: { ...Type.small, color: Colors.tx1, textAlign: 'center', paddingTop: Spacing.sm },
  limitCard: {
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  limitTitle: { ...Type.h3, color: Colors.tx0 },
  limitSub: { ...Type.small, color: Colors.tx1 },
  limitError: { ...Type.small, color: Colors.redAlert },
  limitButton: {
    backgroundColor: Colors.sage,
    borderRadius: Radii.lg,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  limitButtonText: { ...Type.body, fontFamily: Type.h3.fontFamily, color: Colors.bg0 },
  welcome: {
    paddingVertical: Spacing.xl,
  },
  welcomeTitle: {
    ...Type.h1,
    color: Colors.tx0,
  },
  welcomeBody: {
    ...Type.body,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.tx1,
    marginTop: Spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.bg0,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.bg1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    color: Colors.tx0,
    fontFamily: Type.body.fontFamily,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
