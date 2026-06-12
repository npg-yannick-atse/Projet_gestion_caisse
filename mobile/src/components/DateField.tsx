import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Parse 'YYYY-MM-DD' en composantes (sinon aujourd'hui). */
function parse(iso: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

function toIso(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function displayFr(iso: string) {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return p ? `${p[3]}/${p[2]}/${p[1]}` : iso;
}

interface Props {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
}

/** Champ date avec calendrier modal (sans dépendance native). */
export function DateField({ label, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const init = parse(value);
  const [viewY, setViewY] = useState(init.y);
  const [viewM, setViewM] = useState(init.m);

  function openCal() {
    const p = parse(value);
    setViewY(p.y);
    setViewM(p.m);
    setOpen(true);
  }

  function prevMonth() {
    if (viewM === 0) {
      setViewM(11);
      setViewY((y) => y - 1);
    } else setViewM((m) => m - 1);
  }
  function nextMonth() {
    if (viewM === 11) {
      setViewM(0);
      setViewY((y) => y + 1);
    } else setViewM((m) => m + 1);
  }

  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  // getDay(): 0=dim..6=sam → on veut lundi=0
  const firstDow = (new Date(viewY, viewM, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const sel = parse(value);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={openCal}>
        <Text style={styles.value}>{displayFr(value)}</Text>
        <Text style={styles.cal}>📅</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Pressable onPress={prevMonth} hitSlop={10}>
                <Text style={styles.nav}>‹</Text>
              </Pressable>
              <Text style={styles.title}>
                {MONTHS[viewM]} {viewY}
              </Text>
              <Pressable onPress={nextMonth} hitSlop={10}>
                <Text style={styles.nav}>›</Text>
              </Pressable>
            </View>

            <View style={styles.grid}>
              {WEEKDAYS.map((w, i) => (
                <View key={`wd-${i}`} style={styles.cell}>
                  <Text style={styles.weekday}>{w}</Text>
                </View>
              ))}
              {cells.map((d, i) => {
                const isSel = d != null && sel.y === viewY && sel.m === viewM && sel.d === d;
                return (
                  <View key={`c-${i}`} style={styles.cell}>
                    {d != null ? (
                      <Pressable
                        style={[styles.day, isSel && styles.daySel]}
                        onPress={() => {
                          onChange(toIso(viewY, viewM, d));
                          setOpen(false);
                        }}
                      >
                        <Text style={[styles.dayText, isSel && styles.dayTextSel]}>{d}</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.day} />
                    )}
                  </View>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  label: { fontSize: 11, fontWeight: '600', color: '#475569', marginBottom: 4 },
  field: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    height: 40,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  value: { fontSize: 14, color: '#0F172A' },
  cal: { fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 28 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  nav: { fontSize: 26, color: '#0F4C81', paddingHorizontal: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 11, color: '#94A3B8', fontWeight: '600', paddingVertical: 6 },
  day: { height: 38, width: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', margin: 1 },
  daySel: { backgroundColor: '#0F4C81' },
  dayText: { fontSize: 14, color: '#0F172A' },
  dayTextSel: { color: '#fff', fontWeight: '700' },
});
