import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator,
  Linking,
} from 'react-native';
import axios from 'axios';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

// A free sign-up page. It is the only outside link this screen may carry, and
// it opens in the phone's own browser, not inside the app.
const CREATE_CHURCH_URL = 'https://appmychurch.com/Signup';

export default function FindChurchScreen() {
  const [search, setSearch] = useState('');
  const [churches, setChurches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const API_URL = 'https://appmychurch.com/api/v1';

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

  const selectChurch = async (church: any) => {
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Find Your Church</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name..."
          value={search}
          onChangeText={handleSearch}
        />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={churches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={styles.churchItem} 
              onPress={() => selectChurch(item)}
            >
              {item.logo_url ? (
                <Image source={{ uri: item.logo_url }} style={styles.logo} />
              ) : (
                <View style={[styles.logo, styles.logoFallback]}>
                  <Text style={styles.logoText}>{(item.name || '?')[0].toUpperCase()}</Text>
                </View>
              )}
              <View>
                <Text style={styles.churchName}>{item.name}</Text>
                <Text style={styles.churchLocation}>
                  {[item.city, item.state_province].filter(Boolean).join(', ')}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {search.length > 2 ? 'No churches found.' : 'Type at least 3 characters to search.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Sits below the list in the normal layout flow, so it never covers a row. */}
      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <TouchableOpacity
          style={styles.createButton}
          onPress={openCreateChurch}
          accessibilityRole="link"
          accessibilityLabel="Create a Church App"
          accessibilityHint="Opens AppMyChurch.com in your browser"
        >
          {/* One line: the words, then the "opens outside the app" icon to their right. */}
          <Text style={styles.createButtonText} numberOfLines={1}>
            Create a Church App
          </Text>
          <MaterialIcons name="open-in-new" size={18} color="#fff" style={styles.createButtonIcon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#f8f8f8',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  searchInput: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  churchItem: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  churchName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  churchLocation: {
    color: '#666',
  },
  logoFallback: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 22,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  createButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    flexShrink: 1,
  },
  createButtonIcon: {
    marginLeft: 8,
  },
});
