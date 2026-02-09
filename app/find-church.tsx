import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator 
} from 'react-native';
import axios from 'axios';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function FindChurchScreen() {
  const [search, setSearch] = useState('');
  const [churches, setChurches] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

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
});
