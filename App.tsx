import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Appearance, Image, ImageBackground, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, SafeAreaView,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useColorScheme,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { supabase } from './utils/supabase';
// Loaded defensively: if the native module isn't in this build, the app still runs (haptics just stay off).
const Haptics = (() => {
  try { return require('expo-haptics') as typeof import('expo-haptics'); } catch { return null; }
})();

/* ───────────── Types ───────────── */
type Task = {
  id: number; date: string; title: string;
  category: string;              // small tag, e.g. "Nutrition"
  section: string | null;        // group heading, e.g. "Snack break"
  section_time: string | null;   // e.g. "11:00 AM"
  completed: number; skipped: number; sort_order: number;
};
type WaterEntry = { id: number; date: string; amount_ml: number };
type TemplateTask = { title: string; tag: string; section: string; section_time: string | null };
type Template = { id: number; name: string; description: string; tasks: TemplateTask[] };
type Group = { key: string; title: string; time: string | null; items: Task[] };
type DayStat = { date: string; total: number; completed: number; skipped: number; water: number; note: string };
type Tab = 'Today' | 'Routines' | 'History' | 'Settings';
type ThemePref = 'system' | 'light' | 'dark';
type Filter = 'all' | 'complete' | 'incomplete' | 'skipped' | 'notes';

/* ───────────── Themes ───────────── */
const LIGHT = {
  bg: '#F6F5F1', card: '#FFFFFF', ink: '#20251F', muted: '#777D75', line: '#E6E7E0',
  green: '#355C45', greenLight: '#E5EEE6', orange: '#D99A54', red: '#B94D42', onGreen: '#FFFFFF',
  track: '#ECEEE8', chip: '#F1F3EF', chipText: '#6D7A73', preview: '#F8F8F5', inputBg: '#FAFAF7',
  placeholder: '#9A9F98', water: '#EAF2F5', waterIcon: '#D6E8EE', waterInk: '#245D70', waterMuted: '#668A95',
  waterFill: '#4D9CB7', waterBorder: '#BCD4DC', waterLink: '#3D8298', skipBg: '#F5E8D9', skipBorder: '#E3C69F',
  skipInk: '#A77C4D', done: '#939990', dangerBg: '#FBE4E4', subtle: '#EEF2ED', faint: '#92978F',
  rowLine: '#F0F0EC', overlay: 'rgba(20,25,20,0.34)', handle: '#D5D8D0', icon: '#9CA198', toast: '#20251F', toastInk: '#FFFFFF',
};
type Palette = typeof LIGHT;
const DARK: Palette = {
  bg: '#121512', card: '#1C201C', ink: '#ECEFEA', muted: '#9AA197', line: '#2C322B',
  green: '#7FB591', greenLight: '#233328', orange: '#E0A762', red: '#E07B70', onGreen: '#0F1410',
  track: '#2A2F29', chip: '#262B25', chipText: '#A5AEA3', preview: '#171B17', inputBg: '#171B17',
  placeholder: '#6D756B', water: '#18262B', waterIcon: '#1F3640', waterInk: '#8CCBE0', waterMuted: '#7FA3AE',
  waterFill: '#4D9CB7', waterBorder: '#2F4B55', waterLink: '#7FB9CC', skipBg: '#3A2F22', skipBorder: '#6B5434',
  skipInk: '#D9A96B', done: '#6F766D', dangerBg: '#3A2220', subtle: '#252B24', faint: '#6F766D',
  rowLine: '#262B25', overlay: 'rgba(0,0,0,0.55)', handle: '#3A4039', icon: '#7B8379', toast: '#ECEFEA', toastInk: '#121512',
};

const DEFAULT_WATER_GOAL = 3000;
const DEFAULT_PRESETS = [150, 250, 500];
const DAILY_LABEL = 'Daily checklist';
const BAR_H = 72;
const MAX_TASK_NAME = 120;
const MAX_SECTION_NAME = 60;
const MAX_TAG_NAME = 30;
const MAX_TEMPLATE_NAME = 60;
const MAX_TEMPLATE_DESCRIPTION = 180;
const MAX_TEMPLATE_TEXT_LENGTH = 4000;
const MAX_TEMPLATE_LINES = 30;

const EmailIcon = ({ color = '#7A7F7A' }: { color?: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
    <Path d="M4.5 8 12 13l7.5-5" />
  </Svg>
);

const MailBadgeIcon = ({ color = '#FFFFFF' }: { color?: string }) => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
    <Path d="M4.5 8 12 13l7.5-5" />
  </Svg>
);

const LockIcon = ({ color = '#7A7F7A' }: { color?: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M7 10V8a5 5 0 0 1 10 0v2" />
    <Path d="M7 10h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
  </Svg>
);

const EyeIcon = ({ color = '#7A7F7A' }: { color?: string }) => (
  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
    <Path d="M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
  </Svg>
);

const EyeOffIcon = ({ color = '#7A7F7A' }: { color?: string }) => (
  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M3 3l18 18" />
    <Path d="M10.6 10.6A2.5 2.5 0 0 0 13.4 13.4" />
    <Path d="M9.1 5.7A11.4 11.4 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17.5 17.5 0 0 1-4.4 5.5" />
    <Path d="M6.2 6.2A17.8 17.8 0 0 0 2 12s3.5 6.5 10 6.5a10.5 10.5 0 0 0 5.9-1.8" />
  </Svg>
);

/* ───────────── Date + time helpers ───────────── */
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => dateKey(new Date());
const shiftKey = (key: string, offset: number) => { const d = fromKey(key); return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset)); };
const prettyDate = (key: string) => fromKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const shortDate = (key: string) => fromKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const dayIndex = (key: string) => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

const parseClock = (raw: string): { h: number; m: number } | null => {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2]); const ap = m[3]?.toUpperCase();
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
  } else if (h > 23) return null;
  return { h, m: min };
};
const formatClock = ({ h, m }: { h: number; m: number }) => `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
const normalizeClock = (raw: string) => { const t = parseClock(raw); return t ? formatClock(t) : null; };

const computeStreak = (completeDatesDesc: string[]) => {
  const idx = completeDatesDesc.map(dayIndex);
  const set = new Set(idx);
  const today = dayIndex(todayKey());
  let cursor = set.has(today) ? today : today - 1; // today still in progress doesn't break the streak
  let current = 0;
  while (set.has(cursor)) { current++; cursor--; }
  let best = 0, run = 0, prev = -Infinity;
  for (const i of [...idx].reverse()) { run = i - prev === 1 ? run + 1 : 1; best = Math.max(best, run); prev = i; }
  return { current, best };
};

const haptic = (kind: 'light' | 'success') => {
  if (!Haptics) return;
  const p = kind === 'success'
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  Promise.resolve(p).catch(() => {});
};

/* ───────────── Seed routines ───────────── */
const seed = (name: string, description: string, tag: string, titles: string[]) => ({
  name, description,
  tasks: titles.map<TemplateTask>(title => ({ title, tag, section: name, section_time: null })),
});
const SEED_TEMPLATES = [
  seed('Gym day', 'Use on training days; edit the tasks to match your session.', 'Fitness',
    ['Complete planned workout', 'Log workout notes', 'Take planned creatine (if using)']),
  seed('Rest day', 'Recovery without pressure to train.', 'Wellness',
    ['Take a walk or do gentle mobility', 'Prioritise recovery']),
  seed('Travel day', 'Keep only the essentials while away.', 'Travel',
    ['Pack skincare essentials', 'Keep water bottle accessible', 'Get some movement when practical']),
  seed('Morning skincare', 'Your daytime routine; customise products and order.', 'Skincare',
    ['Cleanser', 'Serum / treatment', 'Moisturiser', 'Sunscreen']),
  seed('Evening skincare', 'Your night routine; use treatments only as appropriate.', 'Skincare',
    ['Cleanse face', 'Night treatment (if planned)', 'Moisturiser']),
  seed('Travel skincare', 'A smaller routine for busy or travel days.', 'Skincare',
    ['Cleanse face', 'Moisturiser', 'Sunscreen']),
];

/* ───────────── Template text <-> tasks ─────────────
   11:00 AM — Snack break        (section header, time optional)
   Have Morning Snack | Nutrition (task | tag)
   Drink Water | General
   Snack break:                  (header without time also works)
*/
const TIME_HEADER_RE = /^(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[—–-]\s*(.+)$/i;
const cleanTag = (tag: string) => { const t = tag.trim(); return !t || t.toLowerCase() === 'general' ? 'General' : t; };

const parseTemplateText = (raw: string, fallbackSection: string): TemplateTask[] => {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: TemplateTask[] = [];
  let section = fallbackSection;
  let time: string | null = null;
  for (const original of lines) {
    const line = original.replace(/^[-*•]\s*/, '').trim();
    if (!line) continue;
    const timeHeader = line.match(TIME_HEADER_RE);
    if (timeHeader) {
      time = normalizeClock(timeHeader[1]) ?? timeHeader[1].replace(/\s+/g, ' ').trim().toUpperCase();
      section = timeHeader[2].trim() || fallbackSection;
      continue;
    }
    if (line.endsWith(':')) { section = line.slice(0, -1).trim() || fallbackSection; time = null; continue; }
    const [titlePart, tagPart = ''] = line.split('|').map(p => p.trim());
    if (!titlePart) continue;
    items.push({ title: titlePart, tag: cleanTag(tagPart), section, section_time: time });
  }
  return items;
};

const templateToText = (tasks: TemplateTask[]) => {
  const lines: string[] = [];
  let lastKey = '';
  for (const t of tasks) {
    const key = `${t.section_time ?? ''}|${t.section}`;
    if (key !== lastKey) { lines.push(t.section_time ? `${t.section_time} — ${t.section}` : `${t.section}:`); lastKey = key; }
    lines.push(t.tag && t.tag !== 'General' ? `${t.title} | ${t.tag}` : t.title);
  }
  return lines.join('\n');
};

/* ───────────── Database ───────────── */
let dbInitQueue: Promise<void> = Promise.resolve();
async function initialise(db: SQLiteDatabase) {
  const run = async () => {
    try { await db.execAsync('PRAGMA journal_mode = WAL'); } catch { /* some iOS builds reject this */ }
    try { await db.execAsync('PRAGMA foreign_keys = ON'); } catch {}

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'General', completed INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
        section TEXT DEFAULT NULL, section_time TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  await db.execAsync('CREATE INDEX IF NOT EXISTS tasks_date_idx ON tasks(date);');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS water_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, amount_ml INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.execAsync('CREATE INDEX IF NOT EXISTS water_date_idx ON water_entries(date);');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT ''
    );
  `);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS template_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, template_id INTEGER NOT NULL,
      title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', sort_order INTEGER NOT NULL DEFAULT 0,
      section TEXT DEFAULT NULL, section_time TEXT DEFAULT NULL,
      FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE CASCADE
    );
  `);
  await db.execAsync('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  await db.execAsync('CREATE TABLE IF NOT EXISTS day_notes (date TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT \'\');');

  // ── Migrate databases created by older versions (each ALTER only succeeds once) ──
  let tasksMigrated = false;
  try { await db.execAsync('ALTER TABLE tasks ADD COLUMN section TEXT DEFAULT NULL'); tasksMigrated = true; } catch {}
  try { await db.execAsync('ALTER TABLE tasks ADD COLUMN section_time TEXT DEFAULT NULL'); } catch {}
  if (tasksMigrated) {
    try { await db.execAsync(`UPDATE tasks SET section = COALESCE(time_label, CASE WHEN category != 'General' THEN category END) WHERE section IS NULL`); } catch {}
  }
  let ttMigrated = false;
  try { await db.execAsync('ALTER TABLE template_tasks ADD COLUMN section TEXT DEFAULT NULL'); ttMigrated = true; } catch {}
  try { await db.execAsync('ALTER TABLE template_tasks ADD COLUMN section_time TEXT DEFAULT NULL'); } catch {}
  if (ttMigrated) {
    try {
      await db.execAsync(`UPDATE template_tasks SET section = COALESCE(time_label, (SELECT name FROM templates WHERE templates.id = template_tasks.template_id))`);
    } catch {
      try { await db.execAsync(`UPDATE template_tasks SET section = (SELECT name FROM templates WHERE templates.id = template_tasks.template_id)`); } catch {}
    }
  }

  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM templates');
  if (!count?.count) {
    await db.withTransactionAsync(async () => {
      for (const t of SEED_TEMPLATES) {
        const result = await db.runAsync('INSERT INTO templates(name, description) VALUES (?, ?)', t.name, t.description);
        for (let i = 0; i < t.tasks.length; i++) {
          const k = t.tasks[i];
          await db.runAsync(
            'INSERT INTO template_tasks(template_id, title, category, sort_order, section, section_time) VALUES (?, ?, ?, ?, ?, ?)',
            result.lastInsertRowId, k.title, k.tag, i, k.section, k.section_time);
        }
      }
    });
  }
    const defaults: [string, string][] = [
      ['water_goal_ml', String(DEFAULT_WATER_GOAL)], ['water_presets', DEFAULT_PRESETS.join(',')],
      ['theme', 'system'],
    ];
    for (const [k, v] of defaults) await db.runAsync('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', k, v);
  };

  dbInitQueue = dbInitQueue.then(run, run).then(() => undefined, () => undefined);
  await dbInitQueue;
}

const HISTORY_SQL = `
  WITH days AS (SELECT date FROM tasks UNION SELECT date FROM water_entries UNION SELECT date FROM day_notes),
  t AS (SELECT date, COUNT(*) AS total, SUM(completed) AS completed, SUM(skipped) AS skipped FROM tasks GROUP BY date),
  w AS (SELECT date, SUM(amount_ml) AS water FROM water_entries GROUP BY date)
  SELECT d.date AS date,
         COALESCE(t.total, 0) AS total, COALESCE(t.completed, 0) AS completed, COALESCE(t.skipped, 0) AS skipped,
         COALESCE(w.water, 0) AS water, COALESCE(n.note, '') AS note
  FROM days d
  LEFT JOIN t ON t.date = d.date
  LEFT JOIN w ON w.date = d.date
  LEFT JOIN day_notes n ON n.date = d.date
  ORDER BY d.date DESC LIMIT 120`;

/* ───────────── Swipe row (right = done, left = skip) ───────────── */
function SwipeRow({ C, last, onRight, onLeft, children }: {
  C: Palette; last: boolean; onRight: () => void; onLeft: () => void; children: React.ReactNode;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const cb = useRef({ onRight, onLeft });
  cb.current = { onRight, onLeft };

  const back = useCallback(() => {
    Animated.spring(x, { toValue: 0, tension: 120, friction: 8, useNativeDriver: true }).start();
  }, [x]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      const next = Math.max(-110, Math.min(110, g.dx));
      x.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      const dx = g.dx;
      const vx = g.vx;
      const shouldRight = dx > 72 || (vx > 0.35 && dx > 30);
      const shouldLeft = dx < -72 || (vx < -0.35 && dx < -30);

      if (shouldRight) {
        Animated.spring(x, { toValue: 110, tension: 120, friction: 8, useNativeDriver: true }).start(() => {
          cb.current.onRight();
          back();
        });
        return;
      }
      if (shouldLeft) {
        Animated.spring(x, { toValue: -110, tension: 120, friction: 8, useNativeDriver: true }).start(() => {
          cb.current.onLeft();
          back();
        });
        return;
      }
      back();
    },
    onPanResponderTerminate: back,
    onPanResponderTerminationRequest: () => false,
  })).current;

  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: C.rowLine, overflow: 'hidden' }}>
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12 }]}>
        <Text style={{ color: C.green, fontWeight: '800', fontSize: 12 }}>✓ Done</Text>
        <Text style={{ color: C.skipInk, fontWeight: '800', fontSize: 12 }}>Skip –</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }], backgroundColor: C.card }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

/* ───────────── App ───────────── */
function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: any) => void }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const imageSource = isDark ? require('./assets/icon-dark-preview.png') : require('./assets/icon-preview.png');

  const submit = async () => {
    if (!email || !password) {
      setError('Enter both email and password.');
      return;
    }
    setLoading(true); setError('');
    try {
      const action = mode === 'sign-in'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
      const { data, error: authError } = await action;
      if (authError) throw authError;

      if (mode === 'sign-up') {
        if (!data.session) {
          Alert.alert('Check your email', 'Your account was created. Confirm the email we sent you, then sign in below.', [
            { text: 'OK', onPress: () => { setMode('sign-in'); setPassword(''); } },
          ]);
          setEmail('');
          setPassword('');
          return;
        }
      }

      if (data.session) onAuthenticated(data.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Add your email', 'Enter your email address first so we can send a reset link.');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'daily-routine://reset-password',
      });
      if (error) throw error;
      Alert.alert('Check your email', 'We sent a password reset link to your inbox.');
    } catch (e) {
      Alert.alert('Could not send reset email', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#121512' : '#F6F5F1' }}>
      <ImageBackground source={require('./assets/bg.png')} style={{ flex: 1, width: '100%', height: '120%' }} resizeMode="cover">
        <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 14 }} onPress={Keyboard.dismiss}>
          <View style={{ width: '100%', maxWidth: 420, alignItems: 'center' }}>
          <View style={{ width: 150, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Image source={imageSource} style={{ width: 128, height: 128, resizeMode: 'contain' }} />
          </View>

          <Text style={{ fontSize: 24, lineHeight: 34, letterSpacing: -1.2,marginBottom: 4,marginTop: 4, fontWeight: '800', color: isDark ? '#F0F1EE' : '#20251F', textAlign: 'center' }}>Daily Routine</Text>
          <Text style={{ fontSize: 14, fontWeight: '500', color: isDark ? '#D6D9D2' : '#5B645F', textAlign: 'center', marginTop: 4, marginBottom: 18 }}>Build better days, one checklist at a time.</Text>

          <View style={{ width: '100%', flexDirection: 'row', backgroundColor: isDark ? '#292D28' : '#E5E9E1', borderRadius: 18, padding: 6, marginBottom: 18 }}>
            <Pressable style={[{ flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }, mode === 'sign-in' ? { backgroundColor: isDark ? '#2E5A43' : '#3B6A4F' } : { backgroundColor: 'transparent' }]} onPress={() => setMode('sign-in')}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: mode === 'sign-in' ? '#FFFFFF' : isDark ? '#F0F1EE' : '#2A362F' }}>Sign In</Text>
            </Pressable>
            <Pressable style={[{ flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }, mode === 'sign-up' ? { backgroundColor: isDark ? '#EAEDE8' : '#F5F7F2' } : { backgroundColor: 'transparent' }]} onPress={() => setMode('sign-up')}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: mode === 'sign-up' ? (isDark ? '#1A1E1A' : '#1E2B26') : (isDark ? '#E7E9E4' : '#2A362F') }}>Create Account</Text>
            </Pressable>
          </View>

          <View style={{ width: '100%' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D9DDD6' : '#5B645F', marginBottom: 8 }}>Email</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#40463F' : '#D7DCD4', backgroundColor: isDark ? '#171A16' : '#F7F8F5', paddingHorizontal: 12, marginBottom: 14 }}>
              <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}><EmailIcon color={isDark ? '#C4C8C2' : '#7A7F7A'} /></View>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={isDark ? '#889286' : '#8F978F'} style={{ flex: 1, height: 48, color: isDark ? '#F1F1EE' : '#1F261F', fontSize: 16 }} />
            </View>

            <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#D9DDD6' : '#5B645F', marginBottom: 8 }}>Password</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#40463F' : '#D7DCD4', backgroundColor: isDark ? '#171A16' : '#F7F8F5', paddingHorizontal: 12, marginBottom: 12 }}>
              <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}><LockIcon color={isDark ? '#C4C8C2' : '#7A7F7A'} /></View>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder="Password" placeholderTextColor={isDark ? '#889286' : '#8F978F'} style={{ flex: 1, height: 48, color: isDark ? '#F1F1EE' : '#1F261F', fontSize: 16 }} />
              <Pressable onPress={() => setShowPassword((v) => !v)} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                {showPassword ? <EyeOffIcon color={isDark ? '#D0D5CD' : '#636A63'} /> : <EyeIcon color={isDark ? '#D0D5CD' : '#636A63'} />}
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center' }} onPress={() => setKeepSignedIn((v) => !v)}>
                <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: isDark ? '#7F8B80' : '#7D8C81', backgroundColor: keepSignedIn ? (isDark ? '#3D6F51' : '#3A7857') : 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                  {keepSignedIn ? <Text style={{ fontSize: 11, color: '#FFFFFF' }}>✓</Text> : null}
                </View>
                <Text style={{ fontSize: 13, color: isDark ? '#F3F4F0' : '#262E2A', fontWeight: '600' }}>Keep me signed in</Text>
              </Pressable>
              <Pressable onPress={handleForgotPassword}>
                <Text style={{ fontSize: 13, color: isDark ? '#DCE6E0' : '#374B42', fontWeight: '600' }}>Forgot password?</Text>
              </Pressable>
            </View>

            {error ? <Text style={{ color: '#B94D42', fontSize: 12, marginBottom: 12 }}>{error}</Text> : null}

            <Pressable style={{ backgroundColor: isDark ? '#365E46' : '#315D40', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginBottom: 16 }} onPress={submit} disabled={loading}>
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>{loading ? 'Please wait...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}  →</Text>
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: isDark ? '#3A4039' : '#D8DDD6' }} />
              <Text style={{ marginHorizontal: 10, color: isDark ? '#A7ACA6' : '#7D847E', fontWeight: '600', fontSize: 11 }}>or continue with</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: isDark ? '#3A4039' : '#D8DDD6' }} />
            </View>

            <Pressable style={{ borderWidth: 1, borderColor: isDark ? '#3E443F' : '#D8DDD6', backgroundColor: isDark ? '#161915' : '#F7F8F5', borderRadius: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? '#F1F3EF' : '#1E2B26' }}> Continue with Apple</Text>
            </Pressable>
          </View>
          </View>
        </Pressable>
      </ImageBackground>
    </SafeAreaView>
  );
}

function AppShell({ session }: { session: any }) {
  const db = useSQLiteContext();
  const systemScheme = useColorScheme() ?? 'light';
  const [deviceScheme, setDeviceScheme] = useState<NonNullable<ReturnType<typeof useColorScheme>>>(() => Appearance.getColorScheme() ?? 'light');
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setDeviceScheme(colorScheme ?? 'light');
    });
    return () => sub.remove();
  }, []);

  const [themePref, setThemePref] = useState<ThemePref>('system');
  const resolvedScheme = themePref === 'system' ? (systemScheme || deviceScheme || 'light') : themePref;
  const dark = resolvedScheme === 'dark';
  const C = dark ? DARK : LIGHT;
  const S = useMemo(() => makeStyles(C), [C]);

  const [tab, setTab] = useState<Tab>('Today');
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [supabaseStatus, setSupabaseStatus] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [remoteTodos, setRemoteTodos] = useState<Array<{ id: number | string; title: string; completed: boolean; date: string | null; user_id: string }>>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [tplVersion, setTplVersion] = useState(0);
  const bump = useCallback(() => setDataVersion(v => v + 1), []);

  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [remoteTasks, setRemoteTasks] = useState<Task[]>([]);
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaved, setNoteSaved] = useState('');

  const [waterGoal, setWaterGoal] = useState(DEFAULT_WATER_GOAL);
  const [goalInput, setGoalInput] = useState('3');
  const [presets, setPresets] = useState<number[]>(DEFAULT_PRESETS);
  const [presetInput, setPresetInput] = useState(DEFAULT_PRESETS.join(', '));

  const [streak, setStreak] = useState({ current: 0, best: 0 });
  const [historyDays, setHistoryDays] = useState<DayStat[]>([]);
  const [search, setSearch] = useState('');
  const [searchDates, setSearchDates] = useState<Set<string> | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Task[]>([]);

  // modals
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTag, setTaskTag] = useState('');
  const [taskSection, setTaskSection] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [actionTask, setActionTask] = useState<Task | null>(null);
  const [sectionEdit, setSectionEdit] = useState<{ ids: number[]; name: string; time: string } | null>(null);
  const [customWaterModal, setCustomWaterModal] = useState(false);
  const [customWater, setCustomWater] = useState('');
  const [templateModal, setTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateText, setTemplateText] = useState('');

  // toast (undo)
  const [toast, setToast] = useState<{ message: string; label?: string; onPress?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbWriteQueue = useRef(Promise.resolve());
  const enqueueDbWrite = useCallback(<T,>(run: () => Promise<T>) => {
    const next = dbWriteQueue.current.then(run, run);
    dbWriteQueue.current = next.then(() => undefined, () => undefined);
    return next;
  }, []);
  const showToast = (message: string, label?: string, onPress?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, label, onPress });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const syncChecklist = useCallback(async (date = selectedDate) => {
    if (!session?.user?.id) {
      setSupabaseStatus('Sign in to sync to Supabase.');
      setRemoteTodos([]);
      return;
    }

    try {
      setSupabaseStatus('Syncing checklist with Supabase...');
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('date', date)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []).map((item: any) => ({
        id: Number(item.id),
        title: item.title ?? item.name ?? 'Untitled task',
        completed: Boolean(item.completed),
        date: item.date ?? todayKey(),
        user_id: item.user_id ?? session.user.id,
        section: item.section ?? null,
        section_time: item.section_time ?? null,
        sort_order: Number(item.sort_order ?? 0),
        category: item.category ?? 'General',
        skipped: Boolean(item.skipped),
      }));

      setRemoteTodos(rows);
      setRemoteTasks(rows.map((item: any) => ({
        id: Number(item.id),
        date: item.date ?? todayKey(),
        title: item.title ?? item.name ?? 'Untitled task',
        category: item.category ?? 'General',
        section: item.section ?? null,
        section_time: item.section_time ?? null,
        completed: item.completed ? 1 : 0,
        skipped: item.skipped ? 1 : 0,
        sort_order: item.sort_order ?? 0,
      })));
      const stamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setLastSyncedAt(stamp);
      setSupabaseStatus(rows.length ? `Supabase synced (${rows.length} remote task${rows.length === 1 ? '' : 's'})` : 'Supabase connected, no tasks yet');
    } catch (error) {
      setSupabaseStatus(`Supabase unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [session]);

  useEffect(() => {
    if (session?.user?.id) {
      syncChecklist(selectedDate);
    }
  }, [session, selectedDate, syncChecklist]);

  const dateRef = useRef(selectedDate);
  dateRef.current = selectedDate;

  /** Runs a write; any failure is shown instead of silently doing nothing. */
  const safe = useCallback(async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { Alert.alert('Something went wrong', String(e)); }
  }, []);
  const setSetting = (key: string, value: string) => enqueueDbWrite(() => db.runAsync('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', key, value));
  const nextOrder = async (date: string) =>
    (await db.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM tasks WHERE date = ?', date))?.n ?? 0;

  /* ── Loading: each piece only reloads when its own data changes ── */
  // settings: once
  useEffect(() => {
    (async () => {
      const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
      const s: Record<string, string> = {};
      rows.forEach(r => { s[r.key] = r.value; });
      const goal = Number(s.water_goal_ml || DEFAULT_WATER_GOAL);
      setWaterGoal(goal); setGoalInput(String(goal / 1000));
      const p = (s.water_presets || '').split(',').map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 3);
      const list = p.length ? p : DEFAULT_PRESETS;
      setPresets(list); setPresetInput(list.join(', '));
      setThemePref((['system', 'light', 'dark'].includes(s.theme) ? s.theme : 'system') as ThemePref);
    })().catch(e => Alert.alert('Database error', String(e)));
  }, [db]);

  // the selected day's tasks + water
  useEffect(() => {
    let alive = true;
    (async () => {
      const t = await db.getAllAsync<Task>('SELECT * FROM tasks WHERE date = ? ORDER BY sort_order, id', selectedDate);
      const w = await db.getAllAsync<WaterEntry>('SELECT * FROM water_entries WHERE date = ? ORDER BY id', selectedDate);
      if (alive) { setLocalTasks(t); setWaterEntries(w); }
    })().catch(e => Alert.alert('Database error', String(e)));
    return () => { alive = false; };
  }, [db, selectedDate, dataVersion]);

  // the selected day's note (only when the day changes, so typing is never overwritten)
  useEffect(() => {
    let alive = true;
    (async () => {
      const row = await db.getFirstAsync<{ note: string }>('SELECT note FROM day_notes WHERE date = ?', selectedDate);
      if (alive) { setNoteSaved(row?.note ?? ''); setNoteDraft(row?.note ?? ''); }
    })().catch(() => {});
    return () => { alive = false; };
  }, [db, selectedDate]);

  // routines (single query, grouped in JS)
  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await db.getAllAsync<{ id: number; name: string; description: string }>('SELECT id, name, description FROM templates ORDER BY id');
      const tt = await db.getAllAsync<{ template_id: number; title: string; category: string; section: string | null; section_time: string | null }>(
        'SELECT template_id, title, category, section, section_time FROM template_tasks ORDER BY template_id, sort_order, id');
      const byTemplate = new Map<number, TemplateTask[]>();
      for (const r of tt) {
        const list = byTemplate.get(r.template_id) || [];
        list.push({ title: r.title, tag: r.category || 'General', section: r.section || '', section_time: r.section_time || null });
        byTemplate.set(r.template_id, list);
      }
      const all = rows.map(r => ({
        ...r, tasks: (byTemplate.get(r.id) || []).map(t => ({ ...t, section: t.section || r.name })),
      }));
      if (alive) setTemplates(all);
    })().catch(e => Alert.alert('Database error', String(e)));
    return () => { alive = false; };
  }, [db, tplVersion]);

  // streak always; history list only while the History tab is open
  useEffect(() => {
    let alive = true;
    (async () => {
      const done = await db.getAllAsync<{ date: string }>(
        `SELECT date FROM tasks GROUP BY date
         HAVING COUNT(*) = SUM(CASE WHEN completed = 1 OR skipped = 1 THEN 1 ELSE 0 END) ORDER BY date DESC`);
      if (alive) setStreak(computeStreak(done.map(r => r.date)));
      if (tab === 'History') {
        const rows = await db.getAllAsync<DayStat>(HISTORY_SQL);
        if (alive) setHistoryDays(rows);
      }
    })().catch(() => {});
    return () => { alive = false; };
  }, [db, dataVersion, tab]);

  // history search by task title / note
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchDates(null); return; }
    let alive = true;
    (async () => {
      const rows = await db.getAllAsync<{ date: string }>(
        'SELECT date FROM tasks WHERE title LIKE ? UNION SELECT date FROM day_notes WHERE note LIKE ?', `%${q}%`, `%${q}%`);
      if (alive) setSearchDates(new Set(rows.map(r => r.date)));
    })().catch(() => {});
    return () => { alive = false; };
  }, [db, search, dataVersion]);

  const taskKey = (task: Pick<Task, 'date' | 'title' | 'section' | 'section_time' | 'sort_order'>) => {
    const date = (task.date || '').trim();
    const title = (task.title || '').trim().toLowerCase();
    const section = (task.section || '').trim().toLowerCase();
    const time = (task.section_time || '').trim().toLowerCase();
    const order = Number(task.sort_order ?? 0);
    return `${date}|${order}|${title}|${section}|${time}`;
  };
  const taskMatches = (a: Pick<Task, 'date' | 'title' | 'section' | 'section_time' | 'sort_order'>, b: Pick<Task, 'date' | 'title' | 'section' | 'section_time' | 'sort_order'>) => {
    const aTitle = (a.title ?? '').trim().toLowerCase();
    const bTitle = (b.title ?? '').trim().toLowerCase();
    const aSection = (a.section ?? '').trim().toLowerCase();
    const bSection = (b.section ?? '').trim().toLowerCase();
    const aTime = (a.section_time ?? '').trim().toLowerCase();
    const bTime = (b.section_time ?? '').trim().toLowerCase();
    return a.date === b.date && aTitle === bTitle && aSection === bSection && aTime === bTime && Number(a.sort_order ?? 0) === Number(b.sort_order ?? 0);
  };
  const ensureLocalTaskRow = async (task: Pick<Task, 'date' | 'title' | 'category' | 'section' | 'section_time' | 'sort_order'>) => {
    const existing = await enqueueDbWrite(() => db.getFirstAsync<Task>(
      'SELECT * FROM tasks WHERE date = ? AND title = ? AND COALESCE(section, \'\') = ? AND COALESCE(section_time, \'\') = ? AND sort_order = ?',
      task.date, task.title, task.section ?? '', task.section_time ?? '', Number(task.sort_order ?? 0)));
    if (existing) return existing.id;

    const result = await enqueueDbWrite(() => db.runAsync(
      'INSERT INTO tasks(date, title, category, section, section_time, sort_order, completed, skipped) VALUES (?, ?, ?, ?, ?, ?, 0, 0)',
      task.date, task.title, task.category || 'General', task.section ?? null, task.section_time ?? null, Number(task.sort_order ?? 0)));
    return Number((result as any)?.lastInsertRowId ?? 0);
  };

  const mergeLocalAndRemoteTasks = useCallback((local: Task[], remote: Task[]) => {
    const merged = new Map<string, Task>();

    const add = (task: Task, source: 'local' | 'remote') => {
      const key = taskKey(task);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, task);
        return;
      }
      if (source === 'local') merged.set(key, task);
    };

    local.forEach(task => add(task, 'local'));
    remote.forEach(task => add(task, 'remote'));

    return Array.from(merged.values()).sort((a, b) => {
      const aOrder = Number(a.sort_order ?? 0);
      const bOrder = Number(b.sort_order ?? 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.title).localeCompare(String(b.title));
    });
  }, []);

  const tasks = useMemo(() => mergeLocalAndRemoteTasks(localTasks, remoteTasks), [localTasks, remoteTasks, mergeLocalAndRemoteTasks]);

  /* ── Derived ── */
  const isToday = selectedDate === todayKey();
  const waterTotal = waterEntries.reduce((s, e) => s + e.amount_ml, 0);
  const doneCount = tasks.filter(t => t.completed || t.skipped).length;
  const progress = tasks.length ? doneCount / tasks.length : 0;
  const allDone = tasks.length > 0 && doneCount === tasks.length;

  const taskGroups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const task of tasks) {
      const title = task.section?.trim() || DAILY_LABEL;
      const time = task.section_time?.trim() || null;
      const key = `${time ?? ''}|${title}`;
      const group = map.get(key) || { key, title, time, items: [] };
      group.items.push(task);
      map.set(key, group);
    }
    return Array.from(map.values());
  }, [tasks]);

  const week = useMemo(() => {
    const today = fromKey(todayKey());
    return Array.from({ length: 7 }, (_, n) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - n));
      const key = dateKey(d);
      const h = historyDays.find(x => x.date === key);
      return {
        key, label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        hasTasks: !!h && h.total > 0, rate: h && h.total ? (h.completed + h.skipped) / h.total : 0, water: h?.water || 0,
      };
    });
  }, [historyDays]);
  const weekAvgRate = useMemo(() => { const d = week.filter(w => w.hasTasks); return d.length ? d.reduce((s, w) => s + w.rate, 0) / d.length : 0; }, [week]);
  const weekAvgWater = useMemo(() => { const d = week.filter(w => w.water > 0); return d.length ? d.reduce((s, w) => s + w.water, 0) / d.length : 0; }, [week]);

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return historyDays.filter(d => {
      if (q) {
        const hit = prettyDate(d.date).toLowerCase().includes(q) || d.note.toLowerCase().includes(q) || (searchDates?.has(d.date) ?? false);
        if (!hit) return false;
      }
      const accounted = d.completed + d.skipped;
      switch (filter) {
        case 'complete': return d.total > 0 && accounted === d.total;
        case 'incomplete': return d.total > 0 && accounted < d.total;
        case 'skipped': return d.skipped > 0;
        case 'notes': return d.note.length > 0;
        default: return true;
      }
    });
  }, [historyDays, search, searchDates, filter]);

  /* ── Navigation (flushes an unsaved note first) ── */
  const flushNote = () => {
    if (noteDraft === noteSaved) return;
    const d = selectedDate; const text = noteDraft.trim();
    safe(async () => {
      if (text) await db.runAsync('INSERT OR REPLACE INTO day_notes(date, note) VALUES (?, ?)', d, text);
      else await db.runAsync('DELETE FROM day_notes WHERE date = ?', d);
      if (dateRef.current === d) { setNoteSaved(text); setNoteDraft(text); }
      bump();
    });
  };
  const goTab = (t: Tab) => { flushNote(); if (t !== 'History') setExpandedDate(null); setTab(t); };
  const goDate = (key: string) => { flushNote(); setSelectedDate(key); };

  /* ── Task actions ── */
  const openAdd = () => { setEditingTask(null); setTaskTitle(''); setTaskTag(''); setTaskSection(''); setTaskTime(''); setTaskModal(true); };
  const openEdit = (task: Task) => {
    setEditingTask(task); setTaskTitle(task.title);
    setTaskTag(task.category === 'General' ? '' : task.category);
    setTaskSection(task.section || ''); setTaskTime(task.section_time || ''); setTaskModal(true);
  };
  const pushLocalTasksToSupabase = useCallback(async (overrideTasks?: Task[]) => {
    if (!session?.user?.id) return;
    const rows = (overrideTasks ?? localTasks).map((task) => ({
      user_id: session.user.id,
      title: task.title,
      date: task.date,
      category: task.category || 'General',
      section: task.section || null,
      section_time: task.section_time || null,
      completed: Boolean(task.completed),
      skipped: Boolean(task.skipped),
      sort_order: Number(task.sort_order ?? 0),
      updated_at: new Date().toISOString(),
    }));

    if (!rows.length) return;

    const { error } = await supabase
      .from('todos')
      .upsert(rows, { onConflict: 'user_id,date,title,section,section_time', ignoreDuplicates: false });

    if (error) throw error;
    await syncChecklist();
  }, [localTasks, session, syncChecklist]);

  const saveTask = () => safe(async () => {
    const title = taskTitle.trim();
    if (!title) { Alert.alert('Add a task name', 'Enter a short name for this checklist item.'); return; }
    if (title.length > MAX_TASK_NAME) { Alert.alert('Task name too long', `Keep it under ${MAX_TASK_NAME} characters.`); return; }
    const section = taskSection.trim() || null;
    if (section && section.length > MAX_SECTION_NAME) { Alert.alert('Section name too long', `Keep section names under ${MAX_SECTION_NAME} characters.`); return; }
    if (taskTag.trim() && taskTag.trim().length > MAX_TAG_NAME) { Alert.alert('Tag too long', `Keep tags under ${MAX_TAG_NAME} characters.`); return; }
    if (taskTime.trim() && taskTime.trim().length > 16) { Alert.alert('Time is too long', 'Use a short time like 11:00 AM.'); return; }
    let time: string | null = null;
    if (section && taskTime.trim()) {
      time = normalizeClock(taskTime);
      if (!time) { Alert.alert('Check the time', 'Use a time like 11:00 AM or 14:30.'); return; }
    }
    const tag = cleanTag(taskTag);
    let current: Task | null = null;
    if (editingTask) {
      current = editingTask;
      await db.runAsync('UPDATE tasks SET title = ?, category = ?, section = ?, section_time = ? WHERE id = ?', title, tag, section, time, editingTask.id);
    } else {
      const nextSort = await nextOrder(selectedDate);
      const result = await db.runAsync('INSERT INTO tasks(date, title, category, section, section_time, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        selectedDate, title, tag, section, time, nextSort);
      current = { id: Number((result as any)?.lastInsertRowId ?? 0), date: selectedDate, title, category: tag, section, section_time: time, completed: 0, skipped: 0, sort_order: nextSort } as Task;
    }
    const refreshed = await db.getAllAsync<Task>('SELECT * FROM tasks WHERE date = ? ORDER BY sort_order, id', selectedDate);
    setLocalTasks(refreshed);
    setTaskModal(false); setEditingTask(null);
    if (session?.user?.id) {
      try { await pushLocalTasksToSupabase(refreshed); } catch (error) { setSupabaseStatus(`Sync failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    bump();
  });
  const toggleTask = (task: Task) => safe(async () => {
    const targetId = localTasks.find(t => taskMatches(t, task))?.id ?? await ensureLocalTaskRow(task);
    const completing = !task.completed || !!task.skipped;
    setLocalTasks(prev => prev.map(t => t.id === targetId ? { ...t, completed: completing ? 1 : 0, skipped: 0 } : t));
    if (completing) haptic(tasks.every(t => t.id === targetId || t.completed || t.skipped) ? 'success' : 'light');
    await enqueueDbWrite(() => db.runAsync('UPDATE tasks SET completed = ?, skipped = 0 WHERE id = ?', completing ? 1 : 0, targetId));
    const refreshed = await db.getAllAsync<Task>('SELECT * FROM tasks WHERE date = ? ORDER BY sort_order, id', selectedDate);
    setLocalTasks(refreshed);
    if (session?.user?.id) {
      try { await pushLocalTasksToSupabase(refreshed); } catch (error) { setSupabaseStatus(`Sync failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    bump();
  });
  const skipTask = (task: Task) => safe(async () => {
    const targetId = localTasks.find(t => taskMatches(t, task))?.id ?? await ensureLocalTaskRow(task);
    const skipping = !task.skipped;
    setLocalTasks(prev => prev.map(t => t.id === targetId ? { ...t, skipped: skipping ? 1 : 0, completed: 0 } : t));
    if (skipping) haptic(tasks.every(t => t.id === targetId || t.completed || t.skipped) ? 'success' : 'light');
    await enqueueDbWrite(() => db.runAsync('UPDATE tasks SET skipped = ?, completed = 0 WHERE id = ?', skipping ? 1 : 0, targetId));
    const refreshed = await db.getAllAsync<Task>('SELECT * FROM tasks WHERE date = ? ORDER BY sort_order, id', selectedDate);
    setLocalTasks(refreshed);
    if (session?.user?.id) {
      try { await pushLocalTasksToSupabase(refreshed); } catch (error) { setSupabaseStatus(`Sync failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    bump();
  });
  const deleteTask = (task: Task) => safe(async () => {
    const localMatch = localTasks.find(t => taskMatches(t, task));
    const targetId = localMatch?.id ?? task.id;
    await enqueueDbWrite(() => db.runAsync('DELETE FROM tasks WHERE id = ?', targetId));
    const refreshed = await db.getAllAsync<Task>('SELECT * FROM tasks WHERE date = ? ORDER BY sort_order, id', selectedDate);
    setLocalTasks(refreshed);
    if (session?.user?.id) {
      try { await pushLocalTasksToSupabase(refreshed); } catch (error) { setSupabaseStatus(`Sync failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    bump();
    showToast('Task deleted', 'Undo', () => {
      setToast(null);
      safe(async () => {
        await enqueueDbWrite(() => db.runAsync(
          'INSERT INTO tasks(id, date, title, category, completed, skipped, sort_order, section, section_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          targetId, task.date, task.title, task.category, task.completed, task.skipped, task.sort_order, task.section, task.section_time));
        const refreshedUndo = await db.getAllAsync<Task>('SELECT * FROM tasks WHERE date = ? ORDER BY sort_order, id', selectedDate);
        setLocalTasks(refreshedUndo);
        bump();
      });
    });
  });

  /* ── Reordering ── */
  const persistOrder = (groups: Group[]) => safe(async () => {
    await enqueueDbWrite(() => db.withTransactionAsync(async () => {
      let order = 0;
      for (const g of groups) for (const t of g.items) await db.runAsync('UPDATE tasks SET sort_order = ? WHERE id = ?', order++, t.id);
    }));
    const refreshed = await db.getAllAsync<Task>('SELECT * FROM tasks WHERE date = ? ORDER BY sort_order, id', selectedDate);
    setLocalTasks(refreshed);
    bump();
  });
  const moveTask = (task: Task, dir: -1 | 1) => {
    const groups = taskGroups.map(g => ({ ...g, items: [...g.items] }));
    const g = groups.find(x => x.items.some(t => t.id === task.id));
    if (!g) return;
    const i = g.items.findIndex(t => t.id === task.id); const j = i + dir;
    if (j < 0 || j >= g.items.length) return;
    [g.items[i], g.items[j]] = [g.items[j], g.items[i]];
    persistOrder(groups);
  };
  const moveSection = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= taskGroups.length) return;
    const groups = [...taskGroups];
    [groups[index], groups[j]] = [groups[j], groups[index]];
    persistOrder(groups);
  };

  /* ── Edit a whole section ── */
  const openSectionEdit = (g: Group) =>
    setSectionEdit({ ids: g.items.map(t => t.id), name: g.title === DAILY_LABEL ? '' : g.title, time: g.time || '' });
  const saveSectionEdit = () => safe(async () => {
    if (!sectionEdit) return;
    const name = sectionEdit.name.trim() || null;
    let time: string | null = null;
    if (name && sectionEdit.time.trim()) {
      time = normalizeClock(sectionEdit.time);
      if (!time) { Alert.alert('Check the time', 'Use a time like 11:00 AM or 14:30.'); return; }
    }
    const marks = sectionEdit.ids.map(() => '?').join(',');
    await enqueueDbWrite(() => db.runAsync(`UPDATE tasks SET section = ?, section_time = ? WHERE id IN (${marks})`, name, time, ...sectionEdit.ids));
    setSectionEdit(null); bump();
  });

  /* ── Copy a day forward ── */
  const copyPreviousDay = () => safe(async () => {
    const src = await db.getFirstAsync<{ date: string; c: number }>(
      'SELECT date, COUNT(*) AS c FROM tasks WHERE date < ? GROUP BY date ORDER BY date DESC LIMIT 1', selectedDate);
    if (!src) { Alert.alert('Nothing to copy', 'There are no earlier days with tasks yet.'); return; }
    Alert.alert('Copy tasks forward?', `Copy ${src.c} tasks from ${shortDate(src.date)} to ${shortDate(selectedDate)}? They start unchecked and existing tasks stay.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Copy', onPress: () => safe(async () => {
        const base = await nextOrder(selectedDate);
        await db.runAsync(
          `INSERT INTO tasks(date, title, category, section, section_time, sort_order)
           SELECT ?, title, category, section, section_time, sort_order + ? FROM tasks WHERE date = ? ORDER BY sort_order, id`,
          selectedDate, base, src.date);
        bump();
      }) },
    ]);
  });

  /* ── Water ── */
  const addWater = (amount: number) => safe(async () => {
    await db.runAsync('INSERT INTO water_entries(date, amount_ml) VALUES (?, ?)', selectedDate, amount);
    haptic('light'); bump();
  });
  const undoWater = () => safe(async () => {
    const last = waterEntries[waterEntries.length - 1];
    if (last) { await db.runAsync('DELETE FROM water_entries WHERE id = ?', last.id); bump(); }
  });
  const addCustomWater = () => {
    const ml = Math.round(Number(customWater));
    if (!Number.isFinite(ml) || ml < 1 || ml > 5000) { Alert.alert('Check the amount', 'Enter an amount between 1 and 5000 ml.'); return; }
    setCustomWaterModal(false); setCustomWater(''); addWater(ml);
  };

  /* ── Routines ── */
  const applyTemplate = (template: Template) => {
    if (!template.tasks.length) { Alert.alert('Empty routine', 'Add tasks to this routine first.'); return; }
    Alert.alert('Add routine to this day?', `Add ${template.tasks.length} tasks from “${template.name}” to ${shortDate(selectedDate)}? Existing tasks will stay.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add tasks', onPress: () => safe(async () => {
        const offset = await nextOrder(selectedDate);
        await db.withTransactionAsync(async () => {
          for (let i = 0; i < template.tasks.length; i++) {
            const t = template.tasks[i];
            const sectionName = (t.section || template.name || '').trim() || template.name;
            await db.runAsync(
              'INSERT INTO tasks(date, title, category, section, section_time, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
              selectedDate, t.title, t.tag || 'General', sectionName, t.section_time || null, offset + i);
          }
        });
        goTab('Today'); bump();
      }) },
    ]);
  };
  const deleteTemplate = (template: Template) => Alert.alert('Delete routine?', `Delete “${template.name}”?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => safe(async () => {
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM template_tasks WHERE template_id = ?', template.id);
        await db.runAsync('DELETE FROM templates WHERE id = ?', template.id);
      });
      setTplVersion(v => v + 1);
    }) },
  ]);
  const openTemplateEditor = (template?: Template) => {
    if (template) {
      setEditingTemplate(template); setTemplateName(template.name);
      setTemplateDescription(template.description); setTemplateText(templateToText(template.tasks));
    } else { setEditingTemplate(null); setTemplateName(''); setTemplateDescription(''); setTemplateText(''); }
    setTemplateModal(true);
  };
  const closeTemplateModal = () => { setTemplateModal(false); setEditingTemplate(null); };
  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name) { Alert.alert('Name required', 'Give this routine a name.'); return; }
    if (name.length > MAX_TEMPLATE_NAME) { Alert.alert('Routine name too long', `Keep it under ${MAX_TEMPLATE_NAME} characters.`); return; }
    if (templateDescription.trim().length > MAX_TEMPLATE_DESCRIPTION) { Alert.alert('Description too long', `Keep it under ${MAX_TEMPLATE_DESCRIPTION} characters.`); return; }
    if (templateText.trim().length > MAX_TEMPLATE_TEXT_LENGTH) { Alert.alert('Routine is too long', `Keep it under ${MAX_TEMPLATE_TEXT_LENGTH} characters.`); return; }
    const lines = templateText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > MAX_TEMPLATE_LINES) { Alert.alert('Too many lines', `Keep routines to ${MAX_TEMPLATE_LINES} lines or fewer.`); return; }
    for (const line of lines) {
      if (line.length > 140) { Alert.alert('A line is too long', 'Keep each task or section title shorter than 140 characters.'); return; }
    }
    const items = parseTemplateText(templateText, name);
    if (!items.length) { Alert.alert('Add some tasks', 'One task per line. Start a section with:\n11:00 AM — Snack break'); return; }
    for (const item of items) {
      if ((item.title ?? '').trim().length > MAX_TASK_NAME) { Alert.alert('Task too long', `Each task should be under ${MAX_TASK_NAME} characters.`); return; }
      if ((item.section ?? '').trim().length > MAX_SECTION_NAME) { Alert.alert('Section too long', `Keep section names under ${MAX_SECTION_NAME} characters.`); return; }
      if ((item.tag ?? '').trim().length > MAX_TAG_NAME) { Alert.alert('Tag too long', `Keep tags under ${MAX_TAG_NAME} characters.`); return; }
    }
    try {
      await db.withTransactionAsync(async () => {
        let templateId: number;
        if (editingTemplate) {
          templateId = editingTemplate.id;
          await db.runAsync('UPDATE templates SET name = ?, description = ? WHERE id = ?', name, templateDescription.trim(), templateId);
          await db.runAsync('DELETE FROM template_tasks WHERE template_id = ?', templateId);
        } else {
          const result = await db.runAsync('INSERT INTO templates(name, description) VALUES (?, ?)', name, templateDescription.trim());
          templateId = result.lastInsertRowId;
        }
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const sectionName = (it.section || name || '').trim() || name;
          await db.runAsync(
            'INSERT INTO template_tasks(template_id, title, category, sort_order, section, section_time) VALUES (?, ?, ?, ?, ?, ?)',
            templateId, it.title, it.tag, i, sectionName, it.section_time);
        }
      });
      closeTemplateModal(); setTplVersion(v => v + 1);
    } catch (e) {
      if (String(e).includes('UNIQUE')) Alert.alert('Routine name already used', 'Choose a different name for this routine.');
      else Alert.alert('Could not save routine', String(e));
    }
  };

  /* ── Settings ── */
  const saveGoal = () => safe(async () => {
    const litres = Number(goalInput);
    if (!Number.isFinite(litres) || litres < 0.25 || litres > 10) { Alert.alert('Check your target', 'Enter a target between 0.25 and 10 litres.'); return; }
    const ml = Math.round(litres * 1000);
    await setSetting('water_goal_ml', String(ml));
    setWaterGoal(ml); Alert.alert('Saved', `Daily water target set to ${litres} L.`);
  });
  const savePresets = () => safe(async () => {
    const list = presetInput.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n >= 10 && n <= 3000).map(Math.round).slice(0, 3);
    if (!list.length) { Alert.alert('Check the amounts', 'Enter up to 3 amounts in ml, like 150, 250, 500.'); return; }
    await setSetting('water_presets', list.join(','));
    setPresets(list); setPresetInput(list.join(', ')); Alert.alert('Saved', 'Water buttons updated.');
  });
  const chooseTheme = (t: ThemePref) => safe(async () => { setThemePref(t); await setSetting('theme', t); });

  /* ── History ── */
  const toggleExpanded = (date: string) => safe(async () => {
    if (expandedDate === date) { setExpandedDate(null); return; }
    const rows = await db.getAllAsync<Task>('SELECT * FROM tasks WHERE date = ? ORDER BY sort_order, id', date);
    setExpandedTasks(rows); setExpandedDate(date);
  });

  /* ── Screens ── */
  const header = (title: string, subtitle?: string) => (
    <View style={S.pageHeader}>
      <Text style={S.eyebrow}>DAILY ROUTINE</Text>
      <Text style={S.pageTitle}>{title}</Text>
      {subtitle ? <Text style={S.subtitle}>{subtitle}</Text> : null}
    </View>
  );

  const copyLabel = isToday ? '⧉ Copy yesterday’s tasks' : '⧉ Copy previous day’s tasks';

  const renderToday = () => (
    <>
      {header('Your day', prettyDate(selectedDate))}
      <View style={S.dateRow}>
        <Pressable style={S.iconButton} onPress={() => goDate(shiftKey(selectedDate, -1))}><Text style={S.arrow}>‹</Text></Pressable>
        <Pressable style={S.todayButton} onPress={() => goDate(todayKey())}>
          <Text style={S.todayButtonText}>{isToday ? 'Today' : 'Jump to today'}</Text>
        </Pressable>
        <Pressable style={S.iconButton} onPress={() => goDate(shiftKey(selectedDate, 1))}><Text style={S.arrow}>›</Text></Pressable>
      </View>

      <View style={[S.progressCard, allDone && S.progressCardDone]}>
        <View style={S.rowBetween}>
          <Text style={S.cardTitle}>{isToday ? 'Today’s checklist' : 'Checklist'}</Text>
          <Text style={S.progressNumber}>{doneCount}/{tasks.length}</Text>
        </View>
        <View style={S.progressTrack}><View style={[S.progressFill, { width: `${progress * 100}%` }]} /></View>
        {allDone ? (
          <Text style={S.celebrate}>🎉 {isToday ? 'All done for today' : 'Everything accounted for'} — nice work.</Text>
        ) : (
          <Text style={S.muted}>{tasks.length === 0 ? 'Add a task or apply a routine to get started.' : `${Math.round(progress * 100)}% accounted for · skipped tasks are okay too`}</Text>
        )}
        {streak.current > 0 ? <Text style={S.streakText}>🔥 {streak.current}-day streak</Text> : null}
      </View>

      <View style={S.waterCard}>
        <View style={S.rowBetween}>
          <View>
            <Text style={S.cardTitle}>Water</Text>
            <Text style={S.waterAmount}>{(waterTotal / 1000).toFixed(2)} <Text style={S.waterUnit}>/ {(waterGoal / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} L</Text></Text>
          </View>
          <View style={S.waterIcon}><Text style={{ fontSize: 24 }}>💧</Text></View>
        </View>
        <View style={S.progressTrack}><View style={[S.waterFillBar, { width: `${Math.min(100, (waterTotal / waterGoal) * 100)}%` }]} /></View>
        <View style={S.waterButtons}>
          {presets.map(ml => (
            <Pressable key={ml} style={S.waterButton} onPress={() => addWater(ml)}><Text style={S.waterButtonText}>+{ml} ml</Text></Pressable>
          ))}
          <Pressable style={S.waterButton} onPress={() => { setCustomWater(''); setCustomWaterModal(true); }}><Text style={S.waterButtonText}>Custom</Text></Pressable>
          <Pressable style={[S.waterButton, S.undoButton]} onPress={undoWater}><Text style={S.undoText}>Undo</Text></Pressable>
        </View>
        <Text style={S.muted}>{waterEntries.length} water {waterEntries.length === 1 ? 'entry' : 'entries'} {isToday ? 'today' : 'this day'}</Text>
      </View>

      <View style={S.sectionHeading}>
        <Text style={S.sectionTitleInline}>Checklist</Text>
        <Pressable onPress={openAdd}><Text style={S.addText}>+ Add task</Text></Pressable>
      </View>

      {taskGroups.length === 0 ? (
        <View style={S.emptyCard}>
          <Text style={S.emptyEmoji}>☀️</Text>
          <Text style={S.emptyTitle}>Make {isToday ? 'today' : 'this day'} your own</Text>
          <Text style={S.mutedCenter}>Add a task, use a routine, or copy an earlier day. Your day can be as light or full as you need.</Text>
          <Pressable style={S.primaryButton} onPress={() => goTab('Routines')}><Text style={S.primaryButtonText}>Browse routines</Text></Pressable>
          <Pressable style={S.linkButton} onPress={copyPreviousDay}><Text style={S.linkButtonText}>{copyLabel}</Text></Pressable>
        </View>
      ) : taskGroups.map((group, gi) => (
        <View style={S.groupCard} key={group.key}>
          <View style={S.groupHeader}>
            <View style={S.groupHeaderLeft}>
              {group.time ? <Text style={S.groupTime}>{group.time}</Text> : null}
              <Text style={S.groupTitle}>{group.title}</Text>
            </View>
            <View style={S.groupTools}>
              <Pressable hitSlop={8} disabled={gi === 0} onPress={() => moveSection(gi, -1)}><Text style={[S.toolText, gi === 0 && S.toolDisabled]}>▲</Text></Pressable>
              <Pressable hitSlop={8} disabled={gi === taskGroups.length - 1} onPress={() => moveSection(gi, 1)}><Text style={[S.toolText, gi === taskGroups.length - 1 && S.toolDisabled]}>▼</Text></Pressable>
              <Pressable hitSlop={8} onPress={() => openSectionEdit(group)}><Text style={S.toolText}>✎</Text></Pressable>
            </View>
          </View>
          {group.items.map((task, idx) => (
            <SwipeRow key={task.id} C={C} last={idx === group.items.length - 1} onRight={() => toggleTask(task)} onLeft={() => skipTask(task)}>
              <View style={S.taskRow}>
                <Pressable onPress={() => toggleTask(task)} style={[S.checkbox, task.completed ? S.checkboxDone : null, task.skipped ? S.checkboxSkipped : null]}>
                  <Text style={[S.checkboxMark, task.skipped ? { color: C.skipInk } : null]}>{task.completed ? '✓' : task.skipped ? '–' : ''}</Text>
                </Pressable>
                <Pressable style={S.taskMain} onLongPress={() => openEdit(task)}>
                  <Text style={[S.taskTitle, task.completed ? S.taskComplete : null, task.skipped ? S.taskSkipped : null]}>{task.title}</Text>
                  {task.skipped ? <Text style={S.taskStatus}>Skipped for today</Text> : null}
                </Pressable>
                {task.category && task.category !== 'General' ? (
                  <View style={S.tagChip}><Text style={S.tagChipText}>{task.category}</Text></View>
                ) : null}
                <Pressable style={S.moreButton} onPress={() => setActionTask(task)}><Text style={S.moreText}>•••</Text></Pressable>
              </View>
            </SwipeRow>
          ))}
        </View>
      ))}

      <View style={S.noteCard}>
        <View style={S.rowBetween}>
          <Text style={S.cardTitle}>Day notes</Text>
          {noteDraft !== noteSaved ? <Pressable onPress={flushNote}><Text style={S.addText}>Save</Text></Pressable> : null}
        </View>
        <TextInput
          value={noteDraft} onChangeText={setNoteDraft} onBlur={flushNote} multiline
          placeholder="How did the day go?" placeholderTextColor={C.placeholder} style={S.noteInput}
        />
      </View>

      {taskGroups.length > 0 ? (
        <Pressable style={S.secondaryButton} onPress={copyPreviousDay}><Text style={S.secondaryButtonText}>{copyLabel}</Text></Pressable>
      ) : null}
      <Pressable style={S.secondaryButton} onPress={() => goTab('Routines')}><Text style={S.secondaryButtonText}>＋ Apply a routine</Text></Pressable>
      <Text style={S.footerNote}>Swipe a task right to complete or left to skip. Long-press to edit, or use ••• for more.</Text>
    </>
  );

  const renderTemplates = () => (
    <>
      {header('Routines', 'Reusable sections for the kind of day you are having.')}
      <Pressable style={S.primaryButtonWide} onPress={() => openTemplateEditor()}><Text style={S.primaryButtonText}>＋ Create custom routine</Text></Pressable>
      <Text style={S.sectionTitle}>Ready to use</Text>
      {templates.map(t => {
        const sections = Array.from(new Set(t.tasks.map(x => x.section)));
        return (
          <View style={S.templateCard} key={t.id}>
            <View style={S.rowBetween}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={S.templateName}>{t.name}</Text>
                <Text style={S.templateDescription}>{t.description || 'Your custom reusable routine.'}</Text>
                <Text style={S.templateModeLabel}>{sections.length} {sections.length === 1 ? 'section' : 'sections'}</Text>
              </View>
              <View style={S.templateCount}>
                <Text style={S.templateCountText}>{t.tasks.length}</Text>
                <Text style={S.templateCountLabel}>tasks</Text>
              </View>
            </View>
            <View style={S.templatePreview}>
              {t.tasks.slice(0, 4).map((item, i) => (
                <Text key={`${t.id}-${i}`} style={S.templateTask}>○  {item.title}{item.tag && item.tag !== 'General' ? `  ·  ${item.tag}` : ''}</Text>
              ))}
              {t.tasks.length > 4 ? <Text style={S.muted}>+{t.tasks.length - 4} more</Text> : null}
            </View>
            <View style={S.rowBetween}>
              <Pressable style={[S.secondaryButton, { flex: 1, marginBottom: 0, marginRight: 10 }]} onPress={() => applyTemplate(t)}>
                <Text style={S.secondaryButtonText}>Add to {shortDate(selectedDate)}</Text>
              </Pressable>
              <View style={S.inlineActions}>
                <Pressable style={S.inlineAction} onPress={() => openTemplateEditor(t)}><Text style={S.inlineActionText}>Edit</Text></Pressable>
                <Pressable style={S.inlineActionDanger} onPress={() => deleteTemplate(t)}><Text style={S.inlineActionTextDanger}>Delete</Text></Pressable>
              </View>
            </View>
          </View>
        );
      })}
      <Text style={S.footerNote}>Applying a routine adds its sections to the day; it never replaces tasks already there.</Text>
    </>
  );

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' }, { id: 'complete', label: 'Complete' }, { id: 'incomplete', label: 'Incomplete' },
    { id: 'skipped', label: 'Has skipped' }, { id: 'notes', label: 'Notes' },
  ];

  const renderHistory = () => (
    <>
      {header('History', 'A record of your days.')}

      <View style={S.statRow}>
        <View style={S.statCard}><Text style={S.statValue}>🔥 {streak.current}</Text><Text style={S.statLabel}>Current streak</Text></View>
        <View style={S.statCard}><Text style={S.statValue}>🏆 {streak.best}</Text><Text style={S.statLabel}>Best streak</Text></View>
      </View>

      <View style={S.chartCard}>
        <Text style={S.cardTitle}>Last 7 days</Text>
        <View style={S.chartRow}>
          {week.map(d => (
            <View style={S.chartCol} key={d.key}>
              <View style={S.barArea}>
                <View style={[S.bar, { height: Math.max(3, d.rate * BAR_H), backgroundColor: C.green, opacity: d.hasTasks ? 1 : 0.25 }]} />
                <View style={[S.bar, { height: Math.max(3, Math.min(1, d.water / waterGoal) * BAR_H), backgroundColor: C.waterFill, opacity: d.water > 0 ? 1 : 0.25 }]} />
              </View>
              <Text style={S.chartLabel}>{d.label}</Text>
            </View>
          ))}
        </View>
        <View style={S.legendRow}>
          <View style={[S.legendDot, { backgroundColor: C.green }]} /><Text style={S.legendText}>Tasks accounted for</Text>
          <View style={[S.legendDot, { backgroundColor: C.waterFill, marginLeft: 12 }]} /><Text style={S.legendText}>Water vs target</Text>
        </View>
        <Text style={S.muted}>Average: {Math.round(weekAvgRate * 100)}% tasks · {(weekAvgWater / 1000).toFixed(2)} L water (on days logged)</Text>
      </View>

      <TextInput
        value={search} onChangeText={setSearch} placeholder="Search tasks, notes or dates"
        placeholderTextColor={C.placeholder} style={S.searchInput} returnKeyType="search" clearButtonMode="while-editing"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
        {filters.map(f => (
          <Pressable key={f.id} style={[S.filterChip, filter === f.id && S.filterChipActive]} onPress={() => setFilter(f.id)}>
            <Text style={[S.filterChipText, filter === f.id && S.filterChipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {filteredHistory.length === 0 ? (
        <View style={S.emptyCard}>
          <Text style={S.emptyEmoji}>📖</Text>
          <Text style={S.emptyTitle}>{historyDays.length === 0 ? 'Your history starts here' : 'No matching days'}</Text>
          <Text style={S.mutedCenter}>{historyDays.length === 0 ? 'Once you add tasks, water or notes, your past days will appear here.' : 'Try a different search or filter.'}</Text>
        </View>
      ) : filteredHistory.map(day => {
        const open = expandedDate === day.date;
        return (
          <View key={day.date} style={S.historyCard}>
            <Pressable style={S.historyTop} onPress={() => toggleExpanded(day.date)}>
              <View style={{ flex: 1 }}>
                <Text style={S.historyDate}>{shortDate(day.date)}</Text>
                <Text style={S.muted}>{day.total ? `${day.completed} completed · ${day.skipped} skipped · ${day.total} tasks` : 'No tasks'}</Text>
                <Text style={S.historyWater}>💧 {(day.water / 1000).toFixed(2)} L logged</Text>
                {day.note && !open ? <Text style={S.historyNote} numberOfLines={1}>📝 {day.note}</Text> : null}
              </View>
              <Text style={S.historyArrow}>{open ? '⌄' : '›'}</Text>
            </Pressable>
            {open ? (
              <View style={S.historyDetail}>
                {expandedTasks.length === 0 ? <Text style={S.muted}>No tasks on this day.</Text> : expandedTasks.map(t => (
                  <Text key={t.id} style={[S.detailTask, t.completed ? { color: C.done } : null, t.skipped ? { color: C.skipInk } : null]}>
                    {t.completed ? '✓' : t.skipped ? '–' : '○'}  {t.title}{t.section ? `  ·  ${t.section}` : ''}
                  </Text>
                ))}
                {day.note ? <Text style={S.detailNote}>📝 {day.note}</Text> : null}
                <Pressable style={[S.secondaryButton, { marginTop: 12, marginBottom: 0 }]} onPress={() => { goDate(day.date); goTab('Today'); }}>
                  <Text style={S.secondaryButtonText}>Open this day</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );

  const themeOptions: { id: ThemePref; label: string }[] = [{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }];

  const renderSettings = () => (
    <>
      {header('Settings')}
      <View style={S.settingsCard}>
        <Text style={S.cardTitle}>Account</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 12 }}>
          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: '#F1C9CD', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
            <MailBadgeIcon color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink, flexShrink: 1 }} numberOfLines={1}>
            {session?.user?.email || 'Signed in'}
          </Text>
        </View>
        <Pressable
          style={[S.smallSave, { backgroundColor: C.red, marginTop: 4 }]}
          onPress={async () => {
            try {
              await supabase.auth.signOut();
              Alert.alert('Signed out', 'You have been logged out.');
            } catch (e) {
              Alert.alert('Logout failed', e instanceof Error ? e.message : 'Please try again.');
            }
          }}
        >
          <Text style={[S.smallSaveText, { color: '#FFFFFF' }]}>Logout</Text>
        </Pressable>
      </View>
      <View style={S.settingsCard}>
        <Text style={S.cardTitle}>Appearance</Text>
        <View style={S.modeButtons}>
          {themeOptions.map(o => (
            <Pressable key={o.id} style={[S.modeButton, themePref === o.id && S.modeButtonSelected]} onPress={() => chooseTheme(o.id)}>
              <Text style={[S.modeButtonText, themePref === o.id && S.modeButtonTextSelected]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={S.settingsCard}>
        <Text style={S.cardTitle}>Daily water target</Text>
        <Text style={S.muted}>Set your preferred target in litres.</Text>
        <View style={S.goalRow}>
          <TextInput value={goalInput} onChangeText={setGoalInput} keyboardType="decimal-pad" style={S.goalInput} />
          <Text style={S.goalUnit}>litres per day</Text>
          <Pressable style={S.smallSave} onPress={saveGoal}><Text style={S.smallSaveText}>Save</Text></Pressable>
        </View>
      </View>
      <View style={S.settingsCard}>
        <Text style={S.cardTitle}>Water buttons</Text>
        <Text style={S.muted}>Up to 3 quick amounts in ml, separated by commas. A Custom button is always available.</Text>
        <View style={S.goalRow}>
          <TextInput value={presetInput} onChangeText={setPresetInput} style={[S.goalInput, { width: 150 }]} placeholder="150, 250, 500" placeholderTextColor={C.placeholder} />
          <View style={{ flex: 1 }} />
          <Pressable style={S.smallSave} onPress={savePresets}><Text style={S.smallSaveText}>Save</Text></Pressable>
        </View>
      </View>
    </>
  );

  const tabs: { name: Tab; icon: string }[] = [
    { name: 'Today', icon: '☑' }, { name: 'Routines', icon: '▦' }, { name: 'History', icon: '◷' }, { name: 'Settings', icon: '⚙' },
  ];

  // position info for the task action sheet
  const actionInfo = useMemo(() => {
    if (!actionTask) return null;
    const g = taskGroups.find(x => x.items.some(t => t.id === actionTask.id));
    const i = g ? g.items.findIndex(t => t.id === actionTask.id) : -1;
    return { canUp: i > 0, canDown: !!g && i >= 0 && i < g.items.length - 1 };
  }, [actionTask, taskGroups]);
  const sheetAction = (fn: () => void) => { setActionTask(null); fn(); };

  const existingSections = taskGroups.filter(g => g.title !== DAILY_LABEL);

  return (
    <SafeAreaView style={S.safe}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={S.appBody}>
          <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {tab === 'Today' ? renderToday() : tab === 'Routines' ? renderTemplates() : tab === 'History' ? renderHistory() : renderSettings()}
          </ScrollView>
          {toast ? (
            <View style={S.toast}>
              <Text style={S.toastText}>{toast.message}</Text>
              {toast.label ? <Pressable onPress={toast.onPress}><Text style={S.toastAction}>{toast.label}</Text></Pressable> : null}
            </View>
          ) : null}
          <View style={S.tabBar}>
            {tabs.map(item => (
              <Pressable key={item.name} style={S.tabItem} onPress={() => goTab(item.name)}>
                <Text style={[S.tabIcon, tab === item.name && S.tabIconActive]}>{item.icon}</Text>
                <Text style={[S.tabLabel, tab === item.name && S.tabLabelActive]}>{item.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Task modal */}
      <Modal visible={taskModal} transparent animationType="slide" onRequestClose={() => setTaskModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={S.modalBackdrop}>
          <Pressable style={S.modalDismiss} onPress={() => setTaskModal(false)} />
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>{editingTask ? 'Edit task' : 'New task'}</Text>
            <Text style={S.inputLabel}>TASK NAME</Text>
            <TextInput value={taskTitle} onChangeText={setTaskTitle} placeholder="e.g. Have morning snack" placeholderTextColor={C.placeholder} style={S.textInput} autoFocus returnKeyType="done" />
            <Text style={S.inputLabel}>SECTION (OPTIONAL)</Text>
            <TextInput value={taskSection} onChangeText={setTaskSection} placeholder="e.g. Snack break" placeholderTextColor={C.placeholder} style={S.textInput} />
            {existingSections.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, marginTop: -4 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                {existingSections.map(g => (
                  <Pressable key={g.key} style={S.filterChip} onPress={() => { setTaskSection(g.title); setTaskTime(g.time || ''); }}>
                    <Text style={S.filterChipText}>{g.time ? `${g.time} · ` : ''}{g.title}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <Text style={S.inputLabel}>SECTION TIME (OPTIONAL)</Text>
            <TextInput value={taskTime} onChangeText={setTaskTime} placeholder="e.g. 11:00 AM" placeholderTextColor={C.placeholder} style={S.textInput} />
            <Text style={S.inputLabel}>TAG (OPTIONAL)</Text>
            <TextInput value={taskTag} onChangeText={setTaskTag} placeholder="e.g. Nutrition" placeholderTextColor={C.placeholder} style={S.textInput} />
            <Pressable style={S.primaryButtonWide} onPress={saveTask}><Text style={S.primaryButtonText}>{editingTask ? 'Save changes' : 'Add to this day'}</Text></Pressable>
            <Pressable style={S.cancelButton} onPress={() => setTaskModal(false)}><Text style={S.cancelText}>Cancel</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Task actions */}
      <Modal visible={!!actionTask} transparent animationType="fade" onRequestClose={() => setActionTask(null)}>
        <View style={S.modalBackdrop}>
          <Pressable style={S.modalDismiss} onPress={() => setActionTask(null)} />
          {actionTask ? (
            <View style={S.modalSheet}>
              <View style={S.modalHandle} />
              <Text style={S.sheetTitle} numberOfLines={2}>{actionTask.title}</Text>
              <Pressable style={S.sheetButton} onPress={() => sheetAction(() => openEdit(actionTask))}><Text style={S.sheetButtonText}>Edit</Text></Pressable>
              <Pressable style={S.sheetButton} onPress={() => sheetAction(() => skipTask(actionTask))}><Text style={S.sheetButtonText}>{actionTask.skipped ? 'Unskip' : 'Skip today'}</Text></Pressable>
              {actionInfo?.canUp ? <Pressable style={S.sheetButton} onPress={() => sheetAction(() => moveTask(actionTask, -1))}><Text style={S.sheetButtonText}>Move up</Text></Pressable> : null}
              {actionInfo?.canDown ? <Pressable style={S.sheetButton} onPress={() => sheetAction(() => moveTask(actionTask, 1))}><Text style={S.sheetButtonText}>Move down</Text></Pressable> : null}
              <Pressable style={[S.sheetButton, { backgroundColor: C.dangerBg }]} onPress={() => sheetAction(() => deleteTask(actionTask))}><Text style={[S.sheetButtonText, { color: C.red }]}>Delete</Text></Pressable>
              <Pressable style={S.cancelButton} onPress={() => setActionTask(null)}><Text style={S.cancelText}>Cancel</Text></Pressable>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Section edit */}
      <Modal visible={!!sectionEdit} transparent animationType="slide" onRequestClose={() => setSectionEdit(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={S.modalBackdrop}>
          <Pressable style={S.modalDismiss} onPress={() => setSectionEdit(null)} />
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>Edit section</Text>
            <Text style={S.inputLabel}>SECTION NAME</Text>
            <TextInput value={sectionEdit?.name ?? ''} onChangeText={v => setSectionEdit(s => (s ? { ...s, name: v } : s))} placeholder="e.g. Snack break" placeholderTextColor={C.placeholder} style={S.textInput} autoFocus />
            <Text style={S.inputLabel}>TIME (OPTIONAL)</Text>
            <TextInput value={sectionEdit?.time ?? ''} onChangeText={v => setSectionEdit(s => (s ? { ...s, time: v } : s))} placeholder="e.g. 11:00 AM" placeholderTextColor={C.placeholder} style={S.textInput} />
            <Text style={S.hint}>Changes apply to every task in this section on this day. Clear the name to move them back to the daily checklist.</Text>
            <Pressable style={S.primaryButtonWide} onPress={saveSectionEdit}><Text style={S.primaryButtonText}>Save section</Text></Pressable>
            <Pressable style={S.cancelButton} onPress={() => setSectionEdit(null)}><Text style={S.cancelText}>Cancel</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom water */}
      <Modal visible={customWaterModal} transparent animationType="slide" onRequestClose={() => setCustomWaterModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={S.modalBackdrop}>
          <Pressable style={S.modalDismiss} onPress={() => setCustomWaterModal(false)} />
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>Add water</Text>
            <Text style={S.inputLabel}>AMOUNT (ML)</Text>
            <TextInput value={customWater} onChangeText={setCustomWater} keyboardType="number-pad" placeholder="e.g. 330" placeholderTextColor={C.placeholder} style={S.textInput} autoFocus />
            <Pressable style={S.primaryButtonWide} onPress={addCustomWater}><Text style={S.primaryButtonText}>Add</Text></Pressable>
            <Pressable style={S.cancelButton} onPress={() => setCustomWaterModal(false)}><Text style={S.cancelText}>Cancel</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Routine modal */}
      <Modal visible={templateModal} transparent animationType="slide" onRequestClose={closeTemplateModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={S.modalBackdrop}>
          <Pressable style={S.modalDismiss} onPress={closeTemplateModal} />
          <View style={[S.modalSheet, { maxHeight: '90%' }]}>
            <View style={S.modalHandle} />
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={S.modalTitle}>{editingTemplate ? 'Edit routine' : 'New routine'}</Text>
              <Text style={S.inputLabel}>ROUTINE NAME</Text>
              <TextInput value={templateName} onChangeText={setTemplateName} placeholder="e.g. Busy office day" placeholderTextColor={C.placeholder} style={S.textInput} />
              <Text style={S.inputLabel}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput value={templateDescription} onChangeText={setTemplateDescription} placeholder="What is this routine for?" placeholderTextColor={C.placeholder} style={S.textInput} />
              <Text style={S.inputLabel}>SECTIONS & TASKS</Text>
              <TextInput
                value={templateText} onChangeText={setTemplateText} multiline numberOfLines={8} textAlignVertical="top"
                placeholder={'9:00 AM — Morning routine\nBrush teeth\nDrink water | General\n11:00 AM — Snack break\nHave morning snack | Nutrition\nDrink water | General'}
                placeholderTextColor={C.placeholder} style={[S.textInput, S.multilineInput]}
              />
              <Text style={S.hint}>Start a section with “time — name” (or “name:”). Each line below it is a task. Add “| tag” after a task for a small label. With no section line, tasks go under the routine's name.</Text>
              <Pressable style={S.primaryButtonWide} onPress={saveTemplate}><Text style={S.primaryButtonText}>{editingTemplate ? 'Update routine' : 'Save routine'}</Text></Pressable>
              <Pressable style={S.cancelButton} onPress={closeTemplateModal}><Text style={S.cancelText}>Cancel</Text></Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/** Shows any crash on screen instead of a blank white page. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', marginTop: 30 }}>The app hit an error</Text>
            <Text selectable style={{ marginTop: 12, color: '#B94D42', fontSize: 12 }}>
              {String(this.state.error?.stack || this.state.error)}
            </Text>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session ?? null);
      setReady(true);
    };

    boot();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession ?? null);
        setReady(true);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F5F1' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#20251F' }}>Loading…</Text>
      </View>
    );
  }

  if (!session) {
    return <AuthScreen onAuthenticated={setSession} />;
  }

  return (
    <ErrorBoundary>
      <React.Suspense fallback={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}><Text>Loading database…</Text></View>}>
        <SQLiteProvider databaseName="daily-routine.db" onInit={initialise} useSuspense>
          <AppShell session={session} />
        </SQLiteProvider>
      </React.Suspense>
    </ErrorBoundary>
  );
}

/* ───────────── Styles (rebuilt when the theme changes) ───────────── */
const makeStyles = (C: Palette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  appBody: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 30 },

  pageHeader: { marginBottom: 18 },
  eyebrow: { color: C.green, fontSize: 10, letterSpacing: 2, fontWeight: '800', marginBottom: 8 },
  pageTitle: { fontSize: 32, lineHeight: 38, color: C.ink, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { color: C.muted, fontSize: 14, marginTop: 5 },

  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  iconButton: { width: 42, height: 40, borderRadius: 14, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 28, lineHeight: 30, color: C.ink },
  todayButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 14, backgroundColor: C.greenLight },
  todayButtonText: { color: C.green, fontWeight: '700', fontSize: 13 },

  progressCard: { backgroundColor: C.card, borderRadius: 22, padding: 18, marginBottom: 12 },
  progressCardDone: { backgroundColor: C.greenLight },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  progressNumber: { color: C.green, fontWeight: '800', fontSize: 16 },
  progressTrack: { height: 7, backgroundColor: C.track, borderRadius: 20, overflow: 'hidden', marginTop: 14, marginBottom: 10 },
  progressFill: { height: 7, backgroundColor: C.green, borderRadius: 20 },
  muted: { color: C.muted, fontSize: 12, lineHeight: 18 },
  celebrate: { color: C.green, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  streakText: { color: C.skipInk, fontSize: 12, fontWeight: '800', marginTop: 8 },

  waterCard: { backgroundColor: C.water, borderRadius: 22, padding: 18, marginBottom: 25 },
  waterAmount: { color: C.waterInk, fontSize: 27, fontWeight: '800', marginTop: 7 },
  waterUnit: { color: C.waterMuted, fontSize: 14, fontWeight: '600' },
  waterIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.waterIcon, alignItems: 'center', justifyContent: 'center' },
  waterFillBar: { height: 7, backgroundColor: C.waterFill, borderRadius: 20 },
  waterButtons: { flexDirection: 'row', gap: 6, marginBottom: 9 },
  waterButton: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: C.card, borderRadius: 11 },
  waterButtonText: { color: C.waterInk, fontSize: 11, fontWeight: '800' },
  undoButton: { flex: 0.8, backgroundColor: 'transparent', borderWidth: 1, borderColor: C.waterBorder },
  undoText: { color: C.waterMuted, fontSize: 11, fontWeight: '700' },

  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: C.ink, fontSize: 19, fontWeight: '800', marginBottom: 12 },
  sectionTitleInline: { color: C.ink, fontSize: 19, fontWeight: '800' },
  addText: { color: C.green, fontSize: 14, fontWeight: '800' },

  groupCard: { backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 15, paddingTop: 14, paddingBottom: 2, marginBottom: 12, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  groupHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  groupTime: { fontSize: 11, color: C.green, fontWeight: '800', backgroundColor: C.greenLight, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, overflow: 'hidden' },
  groupTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.1, color: C.muted, fontWeight: '800' },
  groupTools: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 8 },
  toolText: { color: C.muted, fontSize: 14 },
  toolDisabled: { opacity: 0.25 },
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 11, backgroundColor: C.card },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: C.green, borderColor: C.green },
  checkboxSkipped: { backgroundColor: C.skipBg, borderColor: C.skipBorder },
  checkboxMark: { fontSize: 15, fontWeight: '800', color: C.onGreen },
  taskMain: { flex: 1, justifyContent: 'center' },
  taskTitle: { fontSize: 14, color: C.ink, lineHeight: 20 },
  taskComplete: { color: C.done, textDecorationLine: 'line-through' },
  taskSkipped: { color: C.skipInk },
  taskStatus: { color: C.skipInk, fontSize: 10, marginTop: 2 },
  tagChip: { backgroundColor: C.chip, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  tagChipText: { color: C.chipText, fontSize: 10, fontWeight: '700' },
  moreButton: { paddingHorizontal: 4, paddingVertical: 8 },
  moreText: { color: C.icon, letterSpacing: 1, fontSize: 12 },

  noteCard: { backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 12 },
  noteInput: { marginTop: 10, minHeight: 64, color: C.ink, fontSize: 14, lineHeight: 20, textAlignVertical: 'top', padding: 0 },

  emptyCard: { alignItems: 'center', backgroundColor: C.card, borderRadius: 22, padding: 25, marginBottom: 14 },
  emptyEmoji: { fontSize: 34, marginBottom: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 7 },
  mutedCenter: { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  primaryButton: { backgroundColor: C.green, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 17 },
  primaryButtonWide: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 16 },
  primaryButtonText: { color: C.onGreen, fontSize: 14, fontWeight: '800' },
  secondaryButton: { backgroundColor: C.greenLight, borderRadius: 13, paddingVertical: 13, alignItems: 'center', marginBottom: 12 },
  secondaryButtonText: { color: C.green, fontSize: 13, fontWeight: '800' },
  linkButton: { paddingVertical: 12 },
  linkButtonText: { color: C.green, fontSize: 13, fontWeight: '800' },
  footerNote: { color: C.faint, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 4, marginBottom: 12 },

  templateCard: { backgroundColor: C.card, borderRadius: 20, padding: 17, marginBottom: 13 },
  templateName: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 5 },
  templateDescription: { color: C.muted, fontSize: 12, lineHeight: 18 },
  templateModeLabel: { color: C.green, fontSize: 11, fontWeight: '700', marginTop: 6 },
  templateCount: { backgroundColor: C.greenLight, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', minWidth: 52 },
  templateCountText: { color: C.green, fontWeight: '800', fontSize: 18 },
  templateCountLabel: { color: C.green, fontSize: 9, fontWeight: '700' },
  templatePreview: { backgroundColor: C.preview, borderRadius: 13, padding: 12, marginTop: 15, marginBottom: 12, gap: 8 },
  templateTask: { color: C.chipText, fontSize: 12 },
  inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineAction: { backgroundColor: C.subtle, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  inlineActionText: { color: C.green, fontWeight: '700', fontSize: 12 },
  inlineActionDanger: { backgroundColor: C.dangerBg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  inlineActionTextDanger: { color: C.red, fontWeight: '700', fontSize: 12 },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 18, padding: 16 },
  statValue: { color: C.ink, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  statLabel: { color: C.muted, fontSize: 12 },
  chartCard: { backgroundColor: C.card, borderRadius: 20, padding: 17, marginBottom: 14 },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 12 },
  chartCol: { flex: 1, alignItems: 'center' },
  barArea: { height: BAR_H, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  bar: { width: 9, borderRadius: 4 },
  chartLabel: { color: C.muted, fontSize: 10, marginTop: 6, fontWeight: '600' },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  legendText: { color: C.muted, fontSize: 11 },

  searchInput: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.ink, marginBottom: 10 },
  filterChip: { backgroundColor: C.chip, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 13 },
  filterChipActive: { backgroundColor: C.green },
  filterChipText: { color: C.chipText, fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: C.onGreen },

  historyCard: { backgroundColor: C.card, borderRadius: 17, marginBottom: 10, overflow: 'hidden' },
  historyTop: { padding: 16, flexDirection: 'row', alignItems: 'center' },
  historyDate: { color: C.ink, fontSize: 15, fontWeight: '800', marginBottom: 5 },
  historyWater: { color: C.waterLink, fontSize: 12, fontWeight: '700', marginTop: 5 },
  historyNote: { color: C.muted, fontSize: 12, marginTop: 5 },
  historyArrow: { fontSize: 26, color: C.icon, paddingLeft: 8 },
  historyDetail: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: C.rowLine, paddingTop: 12, gap: 8 },
  detailTask: { color: C.ink, fontSize: 13, lineHeight: 19 },
  detailNote: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },

  settingsCard: { backgroundColor: C.card, borderRadius: 18, padding: 17, marginBottom: 13 },
  modeButtons: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modeButton: { flex: 1, paddingVertical: 10, backgroundColor: C.chip, borderRadius: 12, alignItems: 'center' },
  modeButtonSelected: { backgroundColor: C.greenLight, borderWidth: 1, borderColor: C.green },
  modeButtonText: { color: C.chipText, fontWeight: '700', fontSize: 12 },
  modeButtonTextSelected: { color: C.green },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 15 },
  goalInput: { width: 80, borderWidth: 1, borderColor: C.line, backgroundColor: C.inputBg, borderRadius: 12, padding: 11, fontSize: 16, color: C.ink },
  goalUnit: { flex: 1, color: C.muted, fontSize: 12 },
  smallSave: { backgroundColor: C.green, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 17 },
  smallSaveText: { color: C.onGreen, fontWeight: '800' },
  settingsBody: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },

  toast: { position: 'absolute', left: 16, right: 16, bottom: 92, backgroundColor: C.toast, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toastText: { color: C.toastInk, fontSize: 14, fontWeight: '600' },
  toastAction: { color: C.orange, fontSize: 14, fontWeight: '800', paddingLeft: 16 },

  tabBar: { flexDirection: 'row', backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, paddingBottom: 0, paddingHorizontal: 10, minHeight: 54 },
  tabItem: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'center', minHeight: 52 },
  tabIcon: { fontSize: 20, color: C.icon, height: 23 },
  tabIconActive: { color: C.green },
  tabLabel: { fontSize: 10, color: C.icon, fontWeight: '600' },
  tabLabelActive: { color: C.green, fontWeight: '800' },

  modalBackdrop: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalDismiss: { flex: 1 },
  modalSheet: { backgroundColor: C.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 },
  modalHandle: { width: 40, height: 4, backgroundColor: C.handle, borderRadius: 10, alignSelf: 'center', marginBottom: 18 },
  modalTitle: { color: C.ink, fontSize: 23, fontWeight: '800', marginBottom: 20 },
  sheetTitle: { color: C.ink, fontSize: 17, fontWeight: '800', marginBottom: 14 },
  sheetButton: { backgroundColor: C.card, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 8 },
  sheetButtonText: { color: C.ink, fontSize: 15, fontWeight: '700' },
  inputLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8, marginTop: 7 },
  textInput: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: C.ink, marginBottom: 13 },
  multilineInput: { minHeight: 150, textAlignVertical: 'top' },
  hint: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: -5, marginBottom: 14 },
  cancelButton: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: C.muted, fontWeight: '700' },
});