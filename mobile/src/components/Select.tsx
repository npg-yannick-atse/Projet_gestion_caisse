import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Affiche une barre de recherche filtrant les options (listes longues). */
  searchable?: boolean;
}

/** Sélecteur simple : un bouton qui ouvre une liste modale d'options. */
export function Select({ label, value, options, onChange, placeholder = 'Sélectionner…', required, searchable }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>

      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={[styles.fieldText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#64748B" style={{ marginLeft: 8 }} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{label}</Text>
            {searchable ? (
              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder="Rechercher…"
                placeholderTextColor="#94A3B8"
                autoCorrect={false}
                autoCapitalize="none"
              />
            ) : null}
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              renderItem={({ item }) => {
                const isSel = item.value === value;
                return (
                  <Pressable
                    style={styles.option}
                    onPress={() => {
                      onChange(item.value);
                      close();
                    }}
                  >
                    <View style={styles.optionTextWrap}>
                      <Text style={[styles.optionLabel, isSel && styles.optionLabelSel]}>{item.label}</Text>
                      {item.sublabel ? <Text style={styles.optionSub}>{item.sublabel}</Text> : null}
                    </View>
                    {isSel ? <Ionicons name="checkmark" size={18} color="#0F4C81" /> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>Aucun résultat.</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  req: { color: '#EF4444' },
  field: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  fieldText: { flex: 1, fontSize: 15, color: '#0F172A' },
  placeholder: { color: '#94A3B8' },
  chevron: { color: '#64748B', marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#fff', borderRadius: 16, maxHeight: '70%', padding: 16 },
  sheetTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  search: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  sep: { height: 1, backgroundColor: '#F1F5F9' },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  optionTextWrap: { flex: 1 },
  optionLabel: { fontSize: 15, color: '#0F172A' },
  optionLabelSel: { fontWeight: '700', color: '#0F4C81' },
  optionSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  check: { color: '#0F4C81', fontSize: 16, fontWeight: '800', marginLeft: 10 },
  empty: { color: '#64748B', paddingVertical: 16, textAlign: 'center' },
});
