import { useEffect, useMemo, useRef, useState } from 'react';
import { CreatorOnly } from '@/components/shar/CreatorOnly';
import { LayoutAnimation, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Colors, Fonts, Radii, Spacing, Type } from '@/constants/theme';
import { SharColors } from '@/constants/shar';
import { useCredits, useEarnings, useShar } from '@/hooks/use-shar';
import { askAssistant } from '@/lib/ask-assistant';
import { buildFaq, factsFrom, itemById, sectionByKey, type FaqItem, type FaqLink } from '@/lib/faq';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** "Frequently asked questions": a plain page of questions that open in place, any number at once. Answers use the live rules. */
export default function FaqScreen() {
  return (
    <CreatorOnly>
      <FaqScreenContent />
    </CreatorOnly>
  );
}

function FaqScreenContent() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ open?: string; section?: string }>();
  const shar = useShar();
  const earnings = useEarnings();
  const credits = useCredits();

  const sections = useMemo(
    () => buildFaq(factsFrom({ rules: shar.data?.rules, earnings: earnings.data, credits: credits.data })),
    [shar.data?.rules, earnings.data, credits.data],
  );

  // A link from elsewhere in the app can open one question (?open=) or scroll to one group (?section=).
  const openParam = first(params.open);
  const sectionParam = first(params.section);
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const item = itemById(buildFaq(), openParam);
    return new Set(item ? [item.id] : []);
  });
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const jumped = useRef(false);

  const jump = () => {
    if (jumped.current) return;
    const item = itemById(sections, openParam);
    const key = item?.id ?? sectionByKey(sections, sectionParam)?.key;
    if (!key || offsets.current[key] == null) return;
    jumped.current = true;
    scroller.current?.scrollTo({ y: Math.max(0, offsets.current[key] - 12), animated: true });
  };
  useEffect(() => {
    const t = setTimeout(jump, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, sectionParam]);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(160, 'easeInEaseOut', 'opacity'));
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const follow = (link: FaqLink) => {
    if ('ask' in link) {
      if (router.canGoBack()) router.back();
      // Let the screen leave first so the assistant opens over the screen they return to.
      setTimeout(() => askAssistant(link.ask), 250);
    } else {
      router.push(link.to as never); // typed routes pick up the new screens the next time Metro runs
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroller}
        contentContainerStyle={{ paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xxxl * 2, paddingHorizontal: Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
            <BackIcon />
          </Pressable>
        </View>

        <Text style={styles.heading}>Frequently asked questions</Text>
        <Text style={styles.lede}>Quick answers about your money, Shar rewards and the open provider network.</Text>

        {sections.map((section) => (
          <View key={section.key} onLayout={(e) => (offsets.current[section.key] = e.nativeEvent.layout.y)}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.intro ? <Text style={styles.sectionIntro}>{section.intro}</Text> : null}
            <View style={styles.list}>
              {section.items.map((item, i) => (
                <Question
                  key={item.id}
                  item={item}
                  first={i === 0}
                  open={openIds.has(item.id)}
                  onToggle={() => toggle(item.id)}
                  onLink={follow}
                  onLayoutY={(y) => (offsets.current[item.id] = (offsets.current[section.key] ?? 0) + y)}
                />
              ))}
            </View>
          </View>
        ))}

        <View style={styles.help}>
          <Text style={styles.helpTitle}>Still need help?</Text>
          <Text style={styles.helpBody}>Ask the assistant first; it can check your own payments and rewards. You can also reach the team.</Text>
          <View style={styles.helpActions}>
            <HelpButton
              label="Ask the assistant"
              primary
              onPress={() => {
                if (router.canGoBack()) router.back();
                setTimeout(() => askAssistant('I need help with something in Bluvfi.'), 250);
              }}
            />
            <HelpButton label="Telegram" onPress={() => Linking.openURL('https://t.me/+KXpDSUAnfg44MTg0').catch(() => {})} />
            <HelpButton label="@bluvfi on X" onPress={() => Linking.openURL('https://x.com/bluvfi').catch(() => {})} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Question({
  item,
  first: isFirst,
  open,
  onToggle,
  onLink,
  onLayoutY,
}: {
  item: FaqItem;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onLink: (l: FaqLink) => void;
  onLayoutY: (y: number) => void;
}) {
  return (
    <View style={[styles.item, isFirst && styles.itemFirst]} onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.itemHead}>
        <Text style={styles.question}>{item.q}</Text>
        {open ? <Chevron up /> : <Plus />}
      </Pressable>
      {open ? (
        <View style={styles.answerBox}>
          <Text style={styles.answer}>{item.a}</Text>
          {item.links?.map((l) => (
            <Pressable key={l.label} onPress={() => onLink(l)} hitSlop={8} accessibilityRole="link" style={styles.linkWrap}>
              <Text style={styles.link}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function HelpButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.helpButton, primary && styles.helpButtonPrimary]}>
      <Text style={primary ? styles.helpButtonTextPrimary : styles.helpButtonText}>{label}</Text>
    </Pressable>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5l-7 7 7 7" stroke={Colors.tx0} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Plus() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={Colors.tx1} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function Chevron({ up }: { up?: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} stroke={Colors.tx0} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg0 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xl },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  heading: { ...Type.display, color: Colors.tx0 },
  lede: { ...Type.body, color: Colors.tx1, marginTop: Spacing.md },
  sectionTitle: { ...Type.h2, color: Colors.tx0, marginTop: Spacing.xxxl },
  sectionIntro: { ...Type.body, color: Colors.tx1, marginTop: Spacing.xs },
  list: { marginTop: Spacing.md },
  item: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  itemFirst: { borderTopWidth: 1, borderTopColor: Colors.border },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.lg, paddingVertical: Spacing.lg },
  question: { flex: 1, fontFamily: Fonts.sansSemiBold, fontSize: 16, lineHeight: 22, color: Colors.tx0 },
  answerBox: { paddingBottom: Spacing.lg, gap: Spacing.sm },
  answer: { ...Type.body, color: Colors.tx1 },
  linkWrap: { alignSelf: 'flex-start', paddingVertical: 2 },
  link: { ...Type.body, color: SharColors.glow, textDecorationLine: 'underline' },
  help: { marginTop: Spacing.xxxl, backgroundColor: Colors.bg1, borderRadius: Radii.xxl, borderWidth: 1, borderColor: SharColors.tintBorder, padding: Spacing.xl, gap: Spacing.sm },
  helpTitle: { ...Type.h2, color: Colors.tx0 },
  helpBody: { ...Type.body, color: Colors.tx1 },
  helpActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  helpButton: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg0, paddingVertical: 10, paddingHorizontal: Spacing.lg },
  helpButtonPrimary: { backgroundColor: SharColors.deep, borderColor: SharColors.deep },
  helpButtonText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.tx1 },
  helpButtonTextPrimary: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: '#FFFFFF' },
});
