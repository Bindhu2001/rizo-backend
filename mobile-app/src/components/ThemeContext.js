import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme } from './Theme';

const ThemeContext = createContext(lightTheme);

export const ThemeProvider = ({ children }) => {
  const scheme = useColorScheme(); // 'light' | 'dark' | null
  const theme = useMemo(
    () => (scheme === 'dark' ? darkTheme : lightTheme),
    [scheme]
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
