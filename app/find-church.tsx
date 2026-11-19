import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Linking,
} from 'react-native';
import axios from 'axios';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, EmptyState, Loading, Tile } from '../components/ui';
import { setChurchColor, showStandardColor } from '../lib/churchColor';
import { colors, GUTTER, shapes, text } from '../lib/theme';

// A free sign-up page. It is the only outside link this screen may carry, and
// it opens in the phone's own browser, not inside the app.
const CREATE_CHURCH_URL = 'https://appmychurch.com/Signup';

/** A church as the search lists it. */
interface ChurchRow {
  id: string;
  name: string;
  city?: string | null;
  state_province?: string | null;
  logo_url?: string | null;
  /** The church's own colour. Older servers do not send it. */
  theme_color?: string | null;
}

const TILE_SIZE = 48;
const ROW_PADDING_LEFT = 12;
const ROW_GAP = 12;

export default function FindChurchScreen() {
  const [search, setSearch] = useState('');
  const [churches, setChurches] = useState<ChurchRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const API_URL = 'https://appmychurch.com/api/v1';

  // This screen belongs to no church, so it is always the standard blue, also
  // when someone comes back to it from a church's login screen.
  useFocusEffect(
    useCallback(() => {
      showStandardColor();
    }, [])
  );

  const handleSearch = async (text: string) => {
    setSearch(text);
    if (text.length > 2) {
      setIsLoading(true);
      try {
        const response = await axios.get(`${API_URL}/churches?name=${text}`);
        setChurches(response.data);
      } catch (error) {
        console.error('Failed to search churches:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      setChurches([]);
    }
  };

  const selectChurch = async (church: ChurchRow) => {
    // The login, sign-up and forgot-password screens that follow are this church's.
    setChurchColor(church.theme_color);
    await AsyncStorage.setItem('appId', church.id);
    await AsyncStorage.setItem('churchName', church.name);
    if (church.logo_url) {
      await AsyncStorage.setItem('churchLogo', church.logo_url);
    } else {
      await AsyncStorage.removeItem('churchLogo');
    }
    router.push('/login');
  };

  const openCreateChurch = () => {
    Linking.openURL(CREATE_CHURCH_URL).catch((error) => {
      console.error('Failed to open the sign-up page:', error);
    });
  };

  return (
    <View style={shapes.page}>
      <View style={[styles.header, { paddingTop: insets.top + 28 }]}>
        <Text style={text.largeTitle} accessibilityRole="header">
          Find your church
        </Text>
        <Text style={styles.subtitle}>Search by name to join your church family.</Text>
      </View>

      <View style={styles.searchField}>
        <Ionicons name="search" size={20} color={colors.inkSoft} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name..."
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel="Church name"
          value={search}
          onChangeText={handleSearch}
        />
      </View>

      {isLoading ? (
        <Loading />
      ) : (
        <FlatList
          // One tap picks a church even while the keyboard is still up.
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          // The rows share one white rounded block; an empty list shows a message on the page instead.
          contentContainerStyle={churches.length > 0 ? [shapes.group, styles.results] : null}
          data={churches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const location = [item.city, item.state_province].filter(Boolean).join(', ');
            return (
              <TouchableOpacity
                style={styles.churchItem}
                onPress={() => selectChurch(item)}
                activeOpacity={0.6}
                accessibilityRole="button"
              >
                {/* One letter when the church has no logo. */}
                <Tile uri={item.logo_url} name={item.name} size={TILE_SIZE} fit="contain" />
                <View style={styles.churchText}>
                  <Text style={text.headline} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {location ? (
                    <Text style={text.secondary} numberOfLines={1}>
                      {location}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={RowDivider}
          ListEmptyComponent={
            search.length > 2 ? (
              <EmptyState icon="search-outline" title="No churches found." />
            ) : (
              <Text style={styles.hint}>Type at least 3 characters to search.</Text>
            )
          }
        />
      )}

      {/* Sits below the list in the normal layout flow, so it never covers a row. */}
      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        {/* One line: the words, then the "opens outside the app" icon to their right. */}
        <Button
          label="Create a Church App"
          kind="plain"
          iconRight="open-outline"
          onPress={openCreateChurch}
          accessibilityRole="link"
          accessibilityLabel="Create a Church App"
          accessibilityHint="Opens AppMyChurch.com in your browser"
        />
      </View>
    </View>
  );
}

function RowDivider() {
  return <View style={[shapes.divider, styles.rowDivider]} />;
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    gap: 6,
  },
  subtitle: {
    ...text.bodyLarge,
    color: colors.inkMuted,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    marginTop: 20,
    marginHorizontal: GUTTER,
    marginBottom: 16,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.fill,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingVertical: 0,
    fontSize: 17,
    color: colors.ink,
  },
  list: {
    flex: 1,
  },
  results: {
    marginHorizontal: GUTTER,
  },
  churchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    minHeight: 70,
    paddingVertical: 11,
    paddingLeft: ROW_PADDING_LEFT,
    paddingRight: 10,
  },
  churchText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowDivider: {
    marginLeft: ROW_PADDING_LEFT + TILE_SIZE + ROW_GAP,
  },
  hint: {
    ...text.body,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  footer: {
    paddingHorizontal: GUTTER,
    paddingTop: 12,
  },
});
