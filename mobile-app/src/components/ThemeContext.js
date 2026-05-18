import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from './Theme';

const STORAGE_KEY = '@rizo_theme_override';

const ThemeContext = createContext(lightTheme);

export const ThemeProvider = ({ children }) => {
  const systemScheme = useColorScheme();
  // null = follow system, 'light' | 'dark' = manual override
  const [override, setOverride] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === 'light' || val === 'dark') setOverride(val);
      setLoaded(true);
    });
  }, []);

  const toggleTheme = async () => {
    const current = override ?? systemScheme ?? 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    setOverride(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const theme = useMemo(() => {
    const scheme = override ?? systemScheme ?? 'light';
    const base = scheme === 'dark' ? darkTheme : lightTheme;
    return { ...base, toggleTheme };
  }, [override, systemScheme]);

  if (!loaded) return null;

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
